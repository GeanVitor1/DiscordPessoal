using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;
using System.Text;
using System.IO.Pipes;
using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ComponentModel;
using System.Collections.Concurrent;

namespace MeuApp.NativeInput
{
    static class Program
    {
        static readonly HashSet<ushort> HeldKeys = new HashSet<ushort>();
        static readonly HashSet<ushort> HeldScans = new HashSet<ushort>();
        static readonly HashSet<int> HeldButtons = new HashSet<int>();
        static IntPtr TestTarget = IntPtr.Zero;
        [ThreadStatic] static IntPtr AttachedDesktop;
        static int OwnIntegrity;
        static bool InputWasBlocked;
        static InputWorker Worker;

        // Protocol/STA windows and hooks must never own the native input thread.
        sealed class InputWorker : IDisposable {
            readonly BlockingCollection<Action> jobs=new BlockingCollection<Action>();
            readonly Thread thread;
            IntPtr desktopToClose;
            public InputWorker() {
                thread=new Thread(delegate() {
                    try {
                        try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
                        foreach(Action job in jobs.GetConsumingEnumerable())job();
                    } finally { desktopToClose=AttachedDesktop; }
                });
                thread.IsBackground=true;thread.Name="MeuApp native input";thread.SetApartmentState(ApartmentState.MTA);thread.Start();
            }
            public void Run(Action action) {
                Exception failure=null;
                using(ManualResetEventSlim done=new ManualResetEventSlim()) {
                    jobs.Add(delegate(){try{action();}catch(Exception ex){failure=ex;}finally{done.Set();}});
                    done.Wait();
                }
                if(failure!=null)throw failure;
            }
            public void Dispose() {
                jobs.CompleteAdding();thread.Join();jobs.Dispose();
                if(desktopToClose!=IntPtr.Zero)CloseDesktop(desktopToClose);
            }
        }
        static void ExecuteInput(Action action) {
            if(Worker==null)Worker=new InputWorker();
            try{Worker.Run(action);}
            catch(InvalidOperationException ex) {
                if(!ex.Message.StartsWith("DESKTOP_BIND_FAILED:"))throw;
                // A hook installed on a previous desktop can prevent rebinding.
                // A clean thread may retry binding before any input was injected.
                Worker.Dispose();Worker=new InputWorker();
                Worker.Run(delegate(){EnsureInputDesktop();ReleaseHeldInputs();action();});
            }
        }

        // Regression fixture: private inactive desktop plus an owned hook. It
        // never switches the user's visible desktop and never shows a window.
        delegate IntPtr RegressionHook(int code,IntPtr wParam,IntPtr lParam);
        static readonly RegressionHook FixtureHook=delegate(int c,IntPtr w,IntPtr l){return CallNextHookEx(IntPtr.Zero,c,w,l);};
        [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,RegressionHook hook,IntPtr module,uint thread);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr wParam,IntPtr lParam);
        static void BusyDesktopFixture() {
            IntPtr desktop=CreateDesktop("MeuApp-regression-"+Process.GetCurrentProcess().Id,IntPtr.Zero,IntPtr.Zero,0,0x01ff,IntPtr.Zero);
            if(desktop==IntPtr.Zero || !SetThreadDesktop(desktop))throw new InvalidOperationException("TEST_DESKTOP_FAILED:"+Marshal.GetLastWin32Error());
            MSG message;PeekMessage(out message,IntPtr.Zero,0,0,0);
            if(SetWindowsHookEx(3,FixtureHook,IntPtr.Zero,GetCurrentThreadId())==IntPtr.Zero)throw new InvalidOperationException("TEST_HOOK_FAILED:"+Marshal.GetLastWin32Error());
        }

        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
        [DllImport("user32.dll", SetLastError = true)]
        static extern bool SetThreadDesktop(IntPtr desktop);
        [DllImport("user32.dll")]
        static extern IntPtr GetThreadDesktop(uint threadId);
        [DllImport("user32.dll")]
        static extern bool CloseDesktop(IntPtr desktop);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder info, uint length, out uint needed);
        [DllImport("user32.dll", EntryPoint="GetUserObjectInformationW", SetLastError=true)]
        static extern bool GetDesktopInputFlag(IntPtr handle, int index, out int value, uint length, out uint needed);
        [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, uint flags, uint access, IntPtr attributes);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr handle);
        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr info, uint length, out uint needed);

        static int Integrity(uint processId) {
            IntPtr process = OpenProcess(0x1000, false, processId), token = IntPtr.Zero, info = IntPtr.Zero;
            if (process == IntPtr.Zero) return -1;
            try {
                if (!OpenProcessToken(process, 8, out token)) return -1;
                uint needed;
                GetTokenInformation(token, 25, IntPtr.Zero, 0, out needed);
                if (needed == 0) return -1;
                info = Marshal.AllocHGlobal((int)needed);
                if (!GetTokenInformation(token, 25, info, needed, out needed)) return -1;
                string sid = new SecurityIdentifier(Marshal.ReadIntPtr(info)).Value;
                return int.Parse(sid.Substring(sid.LastIndexOf('-') + 1));
            } finally {
                if (info != IntPtr.Zero) Marshal.FreeHGlobal(info);
                if (token != IntPtr.Zero) CloseHandle(token);
                CloseHandle(process);
            }
        }
        static void CheckIntegrity(IntPtr window) {
            uint processId;
            if (window != IntPtr.Zero && GetWindowThreadProcessId(window, out processId) != 0 && Integrity(processId) > OwnIntegrity)
                throw new InvalidOperationException("ELEVATION_REQUIRED");
        }
        static bool IsSecureDesktop(string name) {
            return name.Equals("Winlogon",StringComparison.OrdinalIgnoreCase) || name.Equals("ScreenSaver",StringComparison.OrdinalIgnoreCase) || name.Equals("Screen-saver",StringComparison.OrdinalIgnoreCase);
        }
        static void EnsureInputDesktop() {
            // Read/query rights suffice for binding input; don't request write-object
            // rights that can reject an otherwise accessible custom user desktop.
            IntPtr desktop = OpenInputDesktop(0, false, 0x0001);
            if (desktop == IntPtr.Zero) throw new InvalidOperationException("DESKTOP_ACCESS_DENIED:OPEN:" + Marshal.GetLastWin32Error());
            StringBuilder name = new StringBuilder(256); uint needed;
            if (!GetUserObjectInformation(desktop, 2, name, 512, out needed)) {
                int error = Marshal.GetLastWin32Error(); CloseDesktop(desktop);
                throw new InvalidOperationException("DESKTOP_QUERY_FAILED:NAME:" + error);
            }
            if (IsSecureDesktop(name.ToString())) {
                string desktopName = name.ToString(); CloseDesktop(desktop);
                throw new InvalidOperationException("DESKTOP_SECURE:" + desktopName);
            }
            int receiving;
            if (!GetDesktopInputFlag(desktop,6,out receiving,4,out needed)) { int error=Marshal.GetLastWin32Error();CloseDesktop(desktop);throw new InvalidOperationException("DESKTOP_QUERY_FAILED:INPUT:"+error); }
            if (receiving==0) { CloseDesktop(desktop);throw new InvalidOperationException("DESKTOP_INACTIVE:"+name); }
            // Compare actual input status, not the name: Default isn't a security
            // boundary and a thread can inherit an inactive desktop from its parent.
            if (GetDesktopInputFlag(GetThreadDesktop(GetCurrentThreadId()),6,out receiving,4,out needed) && receiving!=0) { CloseDesktop(desktop);return; }
            if (!SetThreadDesktop(desktop)) { int error = Marshal.GetLastWin32Error(); CloseDesktop(desktop); throw new InvalidOperationException("DESKTOP_BIND_FAILED:" + error); }
            IntPtr previous=AttachedDesktop;
            AttachedDesktop = desktop;
            if(previous!=IntPtr.Zero)CloseDesktop(previous);
        }
        static void Inject(INPUT[] inputs) {
            EnsureInputDesktop();
            CheckIntegrity(GetForegroundWindow());
            if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) == inputs.Length) return;
            int error = Marshal.GetLastWin32Error();
            CheckIntegrity(GetForegroundWindow());
            // UIPI may return zero without a Win32 error; it is not a broken pipe.
            throw new InvalidOperationException((error == 0 || error == 5 ? "INPUT_BLOCKED:" : "SENDINPUT_FAILED:") + error);
        }

        static void ReleaseHeldInputs() {
            foreach (ushort vk in new List<ushort>(HeldKeys)) { try { SendKeyInput(vk, true, (vk >= 0x21 && vk <= 0x28) || vk == 0x2E); } catch { } }
            foreach (ushort code in new List<ushort>(HeldScans)) { try { SendScan(code, true); } catch { } }
            foreach (int btn in new List<int>(HeldButtons)) {
                try { SendMouseInput(btn == 0 ? MOUSEEVENTF_LEFTUP : btn == 1 ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_RIGHTUP); HeldButtons.Remove(btn); } catch { }
            }
        }
        [StructLayout(LayoutKind.Sequential)]
        struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct INPUTUNION
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public uint type;
            public INPUTUNION u;
        }

        const uint INPUT_MOUSE = 0;
        const uint INPUT_KEYBOARD = 1;

        const uint MOUSEEVENTF_MOVE = 0x0001;
        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;
        const uint MOUSEEVENTF_HWHEEL = 0x01000;
        const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("user32.dll")]
        static extern bool AttachThreadInput(uint from, uint to, bool attach);
        [DllImport("kernel32.dll")]
        static extern uint GetCurrentThreadId();
        [StructLayout(LayoutKind.Sequential)]
        struct MSG { public IntPtr window; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public POINT point; public uint reserved; }
        [DllImport("user32.dll")]
        static extern bool PeekMessage(out MSG message, IntPtr window, uint min, uint max, uint remove);
        [DllImport("user32.dll")]
        static extern bool BringWindowToTop(IntPtr window);
        [DllImport("user32.dll")]
        static extern IntPtr WindowFromPoint(POINT point);
        [DllImport("user32.dll")]
        static extern IntPtr GetAncestor(IntPtr window, uint flags);
        [DllImport("user32.dll")]
        static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();
        static void CheckTarget() {
            if (TestTarget != IntPtr.Zero && GetForegroundWindow() != TestTarget) throw new InvalidOperationException("TEST_WINDOW_NOT_FOREGROUND");
        }
        static void CheckMouseTarget(int x,int y) {
            if(TestTarget==IntPtr.Zero)return;
            POINT point=new POINT();point.X=x;point.Y=y;
            if(GetAncestor(WindowFromPoint(point),2)!=TestTarget)throw new InvalidOperationException("TEST_MOUSE_OUTSIDE_WINDOW");
        }

        [DllImport("user32.dll", SetLastError = true)]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll", SetLastError = true)]
        static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        static extern short VkKeyScan(char ch);

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        const int SM_XVIRTUALSCREEN = 76;
        const int SM_YVIRTUALSCREEN = 77;
        const int SM_CXVIRTUALSCREEN = 78;
        const int SM_CYVIRTUALSCREEN = 79;

        static void SendMouseInput(uint flags, int dx = 0, int dy = 0, uint data = 0)
        {
            bool release = (flags == MOUSEEVENTF_LEFTUP && HeldButtons.Contains(0)) || (flags == MOUSEEVENTF_MIDDLEUP && HeldButtons.Contains(1)) || (flags == MOUSEEVENTF_RIGHTUP && HeldButtons.Contains(2));
            if(!release)CheckTarget();
            if(!release && TestTarget!=IntPtr.Zero){POINT cursor;GetCursorPos(out cursor);CheckMouseTarget(cursor.X,cursor.Y);}
            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_MOUSE;
            inputs[0].u.mi.dwFlags = flags;
            inputs[0].u.mi.dx = dx;
            inputs[0].u.mi.dy = dy;
            inputs[0].u.mi.mouseData = data;
            inputs[0].u.mi.time = 0;
            inputs[0].u.mi.dwExtraInfo = IntPtr.Zero;
            Inject(inputs);
        }

        static void MoveToAbsolute(int x, int y)
        {
            CheckTarget();
            CheckMouseTarget(x,y);
            EnsureInputDesktop();
            CheckIntegrity(GetForegroundWindow());
            POINT destination = new POINT(); destination.X = x; destination.Y = y;
            CheckIntegrity(GetAncestor(WindowFromPoint(destination), 2));
            // SetCursorPos directly sets the physical Windows cursor position
            if (!SetCursorPos(x, y)) throw new InvalidOperationException("CURSOR_MOVE_FAILED:" + Marshal.GetLastWin32Error());

            // Also send MOUSEEVENTF_MOVE to trigger window hover/enter/move events
            int vLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
            int vTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
            int vWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            int vHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            if (vWidth <= 0) vWidth = 1920;
            if (vHeight <= 0) vHeight = 1080;

            int normX = Math.Max(0, Math.Min(65535, (int)Math.Round(((double)(x - vLeft) * 65535.0) / Math.Max(1, vWidth - 1))));
            int normY = Math.Max(0, Math.Min(65535, (int)Math.Round(((double)(y - vTop) * 65535.0) / Math.Max(1, vHeight - 1))));

            SendMouseInput(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | 0x4000 /* MOUSEEVENTF_VIRTUALDESK */, normX, normY);
        }

        static void SendKeyInput(ushort vkCode, bool isKeyUp, bool isExtended = false)
        {
            if(!isKeyUp || !HeldKeys.Contains(vkCode))CheckTarget();
            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = vkCode;
            inputs[0].u.ki.wScan = 0;
            inputs[0].u.ki.dwFlags = (isKeyUp ? KEYEVENTF_KEYUP : 0) | (isExtended ? KEYEVENTF_EXTENDEDKEY : 0);
            inputs[0].u.ki.time = 0;
            inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;
            Inject(inputs);
            if (isKeyUp) HeldKeys.Remove(vkCode); else HeldKeys.Add(vkCode);
        }

        static ushort ScanCode(string code) {
            string[] letters = { "KeyA","KeyB","KeyC","KeyD","KeyE","KeyF","KeyG","KeyH","KeyI","KeyJ","KeyK","KeyL","KeyM","KeyN","KeyO","KeyP","KeyQ","KeyR","KeyS","KeyT","KeyU","KeyV","KeyW","KeyX","KeyY","KeyZ" };
            ushort[] scans = { 0x1e,0x30,0x2e,0x20,0x12,0x21,0x22,0x23,0x17,0x24,0x25,0x26,0x32,0x31,0x18,0x19,0x10,0x13,0x1f,0x14,0x16,0x2f,0x11,0x2d,0x15,0x2c };
            for(int i=0;i<letters.Length;i++) if(code==letters[i])return scans[i];
            if(code.StartsWith("Digit") && code.Length==6 && char.IsDigit(code[5]))return (ushort)(code[5]=='0'?0x0b:0x02+code[5]-'1');
            int number;
            if(code.StartsWith("F") && int.TryParse(code.Substring(1),out number) && number>=1 && number<=12)return (ushort)(number<=10?0x3a+number:number==11?0x57:0x58);
            switch(code) {
                case "Escape":return 0x01;case "Backspace":return 0x0e;case "Tab":return 0x0f;case "Enter":return 0x1c;case "Space":return 0x39;
                case "ControlLeft":return 0x1d;case "ControlRight":return 0x11d;case "ShiftLeft":return 0x2a;case "ShiftRight":return 0x36;case "AltLeft":return 0x38;case "AltRight":return 0x138;
                case "MetaLeft":return 0x15b;case "MetaRight":return 0x15c;
                case "ArrowUp":return 0x148;case "ArrowDown":return 0x150;case "ArrowLeft":return 0x14b;case "ArrowRight":return 0x14d;case "Home":return 0x147;case "End":return 0x14f;case "PageUp":return 0x149;case "PageDown":return 0x151;case "Insert":return 0x152;case "Delete":return 0x153;
                case "Minus":return 0x0c;case "Equal":return 0x0d;case "BracketLeft":return 0x1a;case "BracketRight":return 0x1b;case "Backslash":return 0x2b;case "Semicolon":return 0x27;case "Quote":return 0x28;case "Backquote":return 0x29;case "Comma":return 0x33;case "Period":return 0x34;case "Slash":return 0x35;case "IntlBackslash":return 0x56;case "IntlRo":return 0x73;
                case "NumpadEnter":return 0x11c;case "NumpadDivide":return 0x135;case "NumpadMultiply":return 0x37;case "NumpadSubtract":return 0x4a;case "NumpadAdd":return 0x4e;case "NumpadDecimal":return 0x53;case "Numpad0":return 0x52;case "Numpad1":return 0x4f;case "Numpad2":return 0x50;case "Numpad3":return 0x51;case "Numpad4":return 0x4b;case "Numpad5":return 0x4c;case "Numpad6":return 0x4d;case "Numpad7":return 0x47;case "Numpad8":return 0x48;case "Numpad9":return 0x49;case "NumLock":return 0x145;case "CapsLock":return 0x3a;
                case "ContextMenu":return 0x15d;case "PrintScreen":return 0x137;case "ScrollLock":return 0x46;case "IntlYen":return 0x7d;
                default:throw new InvalidOperationException("UNKNOWN_SCAN_CODE");
            }
        }
        static void SendScan(ushort code,bool up) {
            if(!up || !HeldScans.Contains(code))CheckTarget();
            INPUT[] input = new INPUT[1];input[0].type=INPUT_KEYBOARD;input[0].u.ki.wScan=(ushort)(code & 0xff);
            input[0].u.ki.dwFlags=0x0008 | (up?KEYEVENTF_KEYUP:0) | ((code & 0x100)!=0?KEYEVENTF_EXTENDEDKEY:0);
            Inject(input);
            if(up)HeldScans.Remove(code);else HeldScans.Add(code);
        }
        static void SendText(string text) {
            CheckTarget();
            if(text.Length==0 || text.Length>256)throw new InvalidOperationException("INVALID_TEXT");
            foreach(char c in text) {
                if(char.IsControl(c))throw new InvalidOperationException("INVALID_TEXT");
                INPUT[] input=new INPUT[2];
                for(int i=0;i<2;i++){input[i].type=INPUT_KEYBOARD;input[i].u.ki.wScan=c;input[i].u.ki.dwFlags=0x0004 | (i==1?KEYEVENTF_KEYUP:0);}
                Inject(input);
            }
        }

        static ushort MapKeyToVk(string key)
        {
            if (string.IsNullOrEmpty(key)) return 0;
            string upper = key.ToUpperInvariant();
            int functionNumber;
            if (upper.StartsWith("F") && int.TryParse(upper.Substring(1), out functionNumber) && functionNumber >= 1 && functionNumber <= 12)
                return (ushort)(0x70 + functionNumber - 1);

            // Letters A-Z
            if (upper.Length == 1 && upper[0] >= 'A' && upper[0] <= 'Z')
            {
                return (ushort)upper[0];
            }
            // Digits 0-9
            if (upper.Length == 1 && upper[0] >= '0' && upper[0] <= '9')
            {
                return (ushort)upper[0];
            }

            switch (upper)
            {
                case "ENTER":
                case "RETURN":
                    return 0x0D; // VK_RETURN
                case "ESCAPE":
                case "ESC":
                    return 0x1B; // VK_ESCAPE
                case "BACKSPACE":
                    return 0x08; // VK_BACK
                case "TAB":
                    return 0x09; // VK_TAB
                case "SPACE":
                case " ":
                    return 0x20; // VK_SPACE
                case "DELETE":
                case "DEL":
                    return 0x2E; // VK_DELETE
                case "ARROWUP":
                case "UP":
                    return 0x26; // VK_UP
                case "ARROWDOWN":
                case "DOWN":
                    return 0x28; // VK_DOWN
                case "ARROWLEFT":
                case "LEFT":
                    return 0x25; // VK_LEFT
                case "ARROWRIGHT":
                case "RIGHT":
                    return 0x27; // VK_RIGHT
                case "CONTROL":
                case "CTRL":
                    return 0x11; // VK_CONTROL
                case "SHIFT":
                    return 0x10; // VK_SHIFT
                case "ALT":
                    return 0x12; // VK_MENU
                case "META":
                    return 0x5B;
                case "PAGEUP":
                    return 0x21; // VK_PRIOR
                case "PAGEDOWN":
                    return 0x22; // VK_NEXT
                case "HOME":
                    return 0x24; // VK_HOME
                case "END":
                    return 0x23; // VK_END
                default:
                    if (key.Length == 1)
                    {
                        short res = VkKeyScan(key[0]);
                        if (res != -1)
                        {
                            return (ushort)(res & 0xFF);
                        }
                    }
                    return 0;
            }
        }

        [STAThread]
        static void Main(string[] args)
        {
            Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
            if(Array.IndexOf(args,"--test-busy-desktop")>=0) {
                string[] fixtureArgs=Array.FindAll(args,delegate(string arg){return arg!="--test-busy-desktop";});
                Thread fixture=new Thread(delegate(){try{BusyDesktopFixture();Main(fixtureArgs);}catch(Exception ex){Console.WriteLine("ERR "+ex.Message);}});
                fixture.SetApartmentState(ApartmentState.MTA);fixture.Start();fixture.Join();return;
            }
            if (args.Length == 1 && args[0] == "--elevate") { Environment.ExitCode = InputPipe.Relay(true, IntPtr.Zero); return; }
            if (args.Length == 3 && args[0] == "--relay-test" && args[1] == "--target-window") { Environment.ExitCode = InputPipe.Relay(false, new IntPtr(long.Parse(args[2]))); return; }
            if (args.Length >= 3 && args[0] == "--connect-pipe") {
                try { InputPipe.Connect(args[1], uint.Parse(args[2])); }
                catch { Environment.ExitCode = 1; return; }
                if (args.Length == 5 && args[3] == "--target-window") TestTarget = new IntPtr(long.Parse(args[4]));
            }
            OwnIntegrity = Integrity((uint)Process.GetCurrentProcess().Id);
            try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { SetProcessDPIAware(); }
            if(args.Length==2 && args[0]=="--target-window")TestTarget=new IntPtr(long.Parse(args[1]));
            // Self-contained loop reading line-delimited JSON or space-delimited commands from stdin
            Console.WriteLine("READY");
            Console.Out.Flush();

            string line;
            try {
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line.Equals("EXIT", StringComparison.OrdinalIgnoreCase)) break;

                long commandSequence = -1;
                if (line.StartsWith("SEQ ")) {
                    string[] envelope = line.Split(new char[] { ' ' }, 3);
                    if (envelope.Length != 3 || !long.TryParse(envelope[1], out commandSequence) || commandSequence < 0) {
                        Console.WriteLine("ERR INVALID_SEQUENCE"); Console.Out.Flush(); continue;
                    }
                    line = envelope[2];
                }
                TextWriter protocolOutput = Console.Out;
                StringWriter responseOutput = new StringWriter();
                Console.SetOut(responseOutput);

                try
                {
                    ExecuteInput(delegate() {
                    string[] parts = line.Split(' ');
                    string cmd = parts[0].ToUpperInvariant();
                    if (InputWasBlocked && (cmd == "MOVE" || cmd == "MOUSEDOWN" || cmd == "MOUSEUP" || cmd == "SCROLL" || cmd == "TEXT" || cmd == "KEYDOWN" || cmd == "KEYUP")) {
                        EnsureInputDesktop(); CheckIntegrity(GetForegroundWindow()); ReleaseHeldInputs(); InputWasBlocked = false;
                    }

                    switch (cmd)
                    {
                        case "FOCUS_TEST":
                            if(TestTarget==IntPtr.Zero)throw new InvalidOperationException("TEST_MODE_REQUIRED");
                            if(GetForegroundWindow()==TestTarget){Console.WriteLine("OK FOCUS_TEST");break;}
                            uint unused;
                            uint foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out unused);
                            uint currentThread=GetCurrentThreadId();
                            uint targetThread=GetWindowThreadProcessId(TestTarget,out unused);
                            MSG message;PeekMessage(out message,IntPtr.Zero,0,0,0);
                            try {
                                if(foregroundThread!=0 && foregroundThread!=currentThread)AttachThreadInput(currentThread,foregroundThread,true);
                                if(targetThread!=currentThread && targetThread!=foregroundThread)AttachThreadInput(currentThread,targetThread,true);
                                BringWindowToTop(TestTarget);SetForegroundWindow(TestTarget);
                            }
                            finally {
                                if(targetThread!=currentThread && targetThread!=foregroundThread)AttachThreadInput(currentThread,targetThread,false);
                                if(foregroundThread!=0 && foregroundThread!=currentThread)AttachThreadInput(currentThread,foregroundThread,false);
                            }
                            Thread.Sleep(100);CheckTarget();
                            // AttachThreadInput resets thread keyboard state. Restore only
                            // modifiers injected by this helper into the owned test window.
                            foreach(ushort held in new List<ushort>(HeldScans))
                                if(held==0x1d || held==0x11d || held==0x2a || held==0x36 || held==0x38 || held==0x138 || held==0x15b || held==0x15c)SendScan(held,false);
                            Console.WriteLine("OK FOCUS_TEST");break;
                        case "TEXT":
                            SendText(Encoding.UTF8.GetString(Convert.FromBase64String(parts[1])));Console.WriteLine("OK TEXT");break;
                        case "MOVE":
                            if (parts.Length >= 3)
                            {
                                int x = int.Parse(parts[1]);
                                int y = int.Parse(parts[2]);
                                MoveToAbsolute(x, y);
                                POINT actualPosition;
                                if (!GetCursorPos(out actualPosition)) throw new InvalidOperationException("CURSOR_READ_FAILED:" + Marshal.GetLastWin32Error());
                                Console.WriteLine("OK MOVE " + actualPosition.X + " " + actualPosition.Y);
                            }
                            break;

                        case "MOUSEDOWN":
                            if (parts.Length >= 2)
                            {
                                int btn = int.Parse(parts[1]);
                                if (parts.Length >= 4)
                                {
                                    MoveToAbsolute(int.Parse(parts[2]), int.Parse(parts[3]));
                                }
                                if (btn == 0) SendMouseInput(MOUSEEVENTF_LEFTDOWN);
                                else if (btn == 1) SendMouseInput(MOUSEEVENTF_MIDDLEDOWN);
                                else if (btn == 2) SendMouseInput(MOUSEEVENTF_RIGHTDOWN);
                                HeldButtons.Add(btn);
                                Console.WriteLine("OK MOUSEDOWN");
                            }
                            break;

                        case "MOUSEUP":
                            if (parts.Length >= 2)
                            {
                                int btn = int.Parse(parts[1]);
                                if (parts.Length >= 4)
                                {
                                    MoveToAbsolute(int.Parse(parts[2]), int.Parse(parts[3]));
                                }
                                if (btn == 0) SendMouseInput(MOUSEEVENTF_LEFTUP);
                                else if (btn == 1) SendMouseInput(MOUSEEVENTF_MIDDLEUP);
                                else if (btn == 2) SendMouseInput(MOUSEEVENTF_RIGHTUP);
                                HeldButtons.Remove(btn);
                                Console.WriteLine("OK MOUSEUP");
                            }
                            break;

                        case "SCROLL":
                            if (parts.Length >= 2)
                            {
                                int deltaY = (int)Math.Round(double.Parse(parts[1]));
                                int deltaX = parts.Length >= 3 ? (int)Math.Round(double.Parse(parts[2])) : 0;
                                // In Windows SendInput MOUSEEVENTF_WHEEL: positive is up/forward, negative is down/back
                                // Standard wheel click is 120 units
                                if (deltaY != 0)
                                {
                                    SendMouseInput(MOUSEEVENTF_WHEEL, 0, 0, (uint)deltaY);
                                }
                                if (deltaX != 0)
                                {
                                    SendMouseInput(MOUSEEVENTF_HWHEEL, 0, 0, (uint)deltaX);
                                }
                                Console.WriteLine("OK SCROLL");
                            }
                            break;

                        case "KEYDOWN":
                            if (parts.Length >= 2)
                            {
                                string key = parts[1];
                                if (key == "Code:Pause") { SendKeyInput(0x13, false); Console.WriteLine("OK KEYDOWN"); break; }
                                if(key.StartsWith("Code:")){SendScan(ScanCode(key.Substring(5)),false);Console.WriteLine("OK KEYDOWN");break;}
                                ushort vk = MapKeyToVk(key);
                                if (vk != 0)
                                {
                                    bool isExt = (vk >= 0x21 && vk <= 0x28) || vk == 0x2E; // Nav keys
                                    SendKeyInput(vk, false, isExt);
                                    Console.WriteLine("OK KEYDOWN");
                                }
                                else
                                {
                                    Console.WriteLine("ERR UNKNOWN_KEY");
                                }
                            }
                            break;

                        case "KEYUP":
                            if (parts.Length >= 2)
                            {
                                string key = parts[1];
                                if (key == "Code:Pause") { SendKeyInput(0x13, true); Console.WriteLine("OK KEYUP"); break; }
                                if(key.StartsWith("Code:")){SendScan(ScanCode(key.Substring(5)),true);Console.WriteLine("OK KEYUP");break;}
                                ushort vk = MapKeyToVk(key);
                                if (vk != 0)
                                {
                                    bool isExt = (vk >= 0x21 && vk <= 0x28) || vk == 0x2E;
                                    SendKeyInput(vk, true, isExt);
                                    Console.WriteLine("OK KEYUP");
                                }
                                else
                                {
                                    Console.WriteLine("ERR UNKNOWN_KEY");
                                }
                            }
                            break;

                        case "PING":
                            Console.WriteLine("PONG");
                            break;
                        case "STATUS":
                            EnsureInputDesktop();
                            if (OwnIntegrity < 0) throw new InvalidOperationException("TOKEN_QUERY_FAILED");
                            Console.WriteLine("OK STATUS " + Marshal.SizeOf(typeof(INPUT)) + " " + OwnIntegrity);
                            break;

                        case "DESKTOP_POLICY_TEST":
                            Console.WriteLine(IsSecureDesktop(parts[1])?"OK SECURE":"OK USER_DESKTOP");break;

                        default:
                            Console.WriteLine("ERR UNKNOWN_COMMAND");
                            break;
                    }
                    });
                }
                catch (Exception ex)
                {
                    if (ex.Message.StartsWith("ELEVATION_REQUIRED") || ex.Message.StartsWith("DESKTOP_") || ex.Message.StartsWith("INPUT_BLOCKED")) InputWasBlocked = true;
                    Console.WriteLine("ERR " + ex.Message);
                }

                Console.SetOut(protocolOutput);
                string response = responseOutput.ToString().Trim();
                if (response.Length == 0) response = "ERR INVALID_COMMAND";
                Console.WriteLine(commandSequence >= 0 ? "ACK " + commandSequence + " " + response : response);
                Console.Out.Flush();
            }
            } catch (IOException) {
                // A broker crash closes the pipe; release input even when ReadLine throws.
            } finally {
            // Parent exit/crash closes stdin. Never leave injected modifiers or buttons held.
            try{ExecuteInput(ReleaseHeldInputs);}finally{if(Worker!=null)Worker.Dispose();}
            }
        }
    }

    // Keep the Electron stdin/stdout protocol while elevating only the input
    // helper. The pipe is local, restricted to this Windows user/admins, and both
    // ends verify the peer PID. No listener or privilege survives parent EOF.
    static class InputPipe {
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint id);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetNamedPipeClientProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint id);
        static NamedPipeClientStream Client;
        public static void Connect(string name, uint parentId) {
            if (!name.StartsWith("MeuApp-input-", StringComparison.Ordinal)) throw new InvalidOperationException();
            Client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.None, TokenImpersonationLevel.Identification);
            Client.Connect(20000);
            uint actual;
            if (!GetNamedPipeServerProcessId(Client.SafePipeHandle, out actual) || actual != parentId) { Client.Dispose(); throw new InvalidOperationException(); }
            Console.SetIn(new StreamReader(Client, new UTF8Encoding(false), false, 4096, true));
            Console.SetOut(new StreamWriter(Client, new UTF8Encoding(false), 4096, true) { AutoFlush = true });
        }
        public static int Relay(bool elevate, IntPtr testTarget) {
            string name = "MeuApp-input-" + Guid.NewGuid().ToString("N");
            PipeSecurity security = new PipeSecurity();
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), PipeAccessRights.ReadWrite, AccessControlType.Allow));
            using (NamedPipeServerStream server = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096, security)) {
                using (ManualResetEvent connected = new ManualResetEvent(false)) {
                    bool parentClosed = false;
                    StreamWriter commands = null;
                    Thread input = new Thread(delegate() {
                        try {
                            string line;
                            while ((line = Console.ReadLine()) != null) {
                                connected.WaitOne();
                                if (commands == null) break;
                                commands.WriteLine(line);
                            }
                            parentClosed = true;
                            connected.WaitOne();
                            if (commands != null) commands.WriteLine("EXIT");
                        } catch { parentClosed = true; try { server.Dispose(); } catch { } }
                    });
                    input.IsBackground = true; input.Start();
                    Process child = null;
                    try {
                        string arguments = "--connect-pipe " + name + " " + Process.GetCurrentProcess().Id;
                        if (testTarget != IntPtr.Zero) arguments += " --target-window " + testTarget.ToInt64();
                        ProcessStartInfo start = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, arguments);
                        start.UseShellExecute = elevate; start.Verb = elevate ? "runas" : "";
                        start.WindowStyle = ProcessWindowStyle.Hidden; start.CreateNoWindow = true;
                        child = Process.Start(start);
                        IAsyncResult waiting = server.BeginWaitForConnection(null, null);
                        if (!waiting.AsyncWaitHandle.WaitOne(20000)) throw new InvalidOperationException("ELEVATION_TIMEOUT");
                        server.EndWaitForConnection(waiting);
                        uint actual;
                        if (!GetNamedPipeClientProcessId(server.SafePipeHandle, out actual) || actual != child.Id) throw new InvalidOperationException("PIPE_PEER_REJECTED");
                        commands = new StreamWriter(server, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                        connected.Set();
                        if (parentClosed) commands.WriteLine("EXIT");
                        using (StreamReader responses = new StreamReader(server, new UTF8Encoding(false), false, 4096, true)) {
                            string line;
                            while ((line = responses.ReadLine()) != null) { Console.WriteLine(line); Console.Out.Flush(); }
                        }
                        return 0;
                    } catch (Win32Exception ex) {
                        Console.WriteLine(ex.NativeErrorCode == 1223 ? "ERR ELEVATION_CANCELLED" : "ERR ELEVATION_FAILED"); Console.Out.Flush(); return 1;
                    } catch {
                        Console.WriteLine("ERR PIPE_START_FAILED"); Console.Out.Flush(); return 1;
                    } finally {
                        commands = null; connected.Set();
                        if (child != null) child.Dispose();
                    }
                }
            }
        }
    }
}
