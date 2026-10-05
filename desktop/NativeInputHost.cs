using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;
using System.Text;

namespace MeuApp.NativeInput
{
    static class Program
    {
        static readonly HashSet<ushort> HeldKeys = new HashSet<ushort>();
        static readonly HashSet<ushort> HeldScans = new HashSet<ushort>();
        static readonly HashSet<int> HeldButtons = new HashSet<int>();
        static IntPtr TestTarget = IntPtr.Zero;
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
            if (SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) != 1) throw new InvalidOperationException("SENDINPUT_FAILED:" + Marshal.GetLastWin32Error());
        }

        static void MoveToAbsolute(int x, int y)
        {
            CheckTarget();
            CheckMouseTarget(x,y);
            // SetCursorPos directly sets the physical Windows cursor position
            if (!SetCursorPos(x, y)) throw new InvalidOperationException("CURSOR_FAILED:" + Marshal.GetLastWin32Error());

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
            if (SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) != 1) throw new InvalidOperationException("SENDINPUT_FAILED:" + Marshal.GetLastWin32Error());
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
                default:throw new InvalidOperationException("UNKNOWN_SCAN_CODE");
            }
        }
        static void SendScan(ushort code,bool up) {
            if(!up || !HeldScans.Contains(code))CheckTarget();
            INPUT[] input = new INPUT[1];input[0].type=INPUT_KEYBOARD;input[0].u.ki.wScan=(ushort)(code & 0xff);
            input[0].u.ki.dwFlags=0x0008 | (up?KEYEVENTF_KEYUP:0) | ((code & 0x100)!=0?KEYEVENTF_EXTENDEDKEY:0);
            if(SendInput(1,input,Marshal.SizeOf(typeof(INPUT)))!=1)throw new InvalidOperationException("SENDINPUT_FAILED:" + Marshal.GetLastWin32Error());
            if(up)HeldScans.Remove(code);else HeldScans.Add(code);
        }
        static void SendText(string text) {
            CheckTarget();
            if(text.Length==0 || text.Length>256)throw new InvalidOperationException("INVALID_TEXT");
            foreach(char c in text) {
                if(char.IsControl(c))throw new InvalidOperationException("INVALID_TEXT");
                INPUT[] input=new INPUT[2];
                for(int i=0;i<2;i++){input[i].type=INPUT_KEYBOARD;input[i].u.ki.wScan=c;input[i].u.ki.dwFlags=0x0004 | (i==1?KEYEVENTF_KEYUP:0);}
                if(SendInput(2,input,Marshal.SizeOf(typeof(INPUT)))!=2)throw new InvalidOperationException("SENDINPUT_FAILED:" + Marshal.GetLastWin32Error());
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
            try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { SetProcessDPIAware(); }
            if(args.Length==2 && args[0]=="--target-window")TestTarget=new IntPtr(long.Parse(args[1]));
            // Self-contained loop reading line-delimited JSON or space-delimited commands from stdin
            Console.WriteLine("READY");
            Console.Out.Flush();

            string line;
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
                    string[] parts = line.Split(' ');
                    string cmd = parts[0].ToUpperInvariant();

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

                        default:
                            Console.WriteLine("ERR UNKNOWN_COMMAND");
                            break;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("ERR " + ex.Message);
                }

                Console.SetOut(protocolOutput);
                string response = responseOutput.ToString().Trim();
                if (response.Length == 0) response = "ERR INVALID_COMMAND";
                Console.WriteLine(commandSequence >= 0 ? "ACK " + commandSequence + " " + response : response);
                Console.Out.Flush();
            }
            // Parent exit/crash closes stdin. Never leave injected modifiers or buttons held.
            foreach (ushort vk in new List<ushort>(HeldKeys)) {
                try { SendKeyInput(vk, true, (vk >= 0x21 && vk <= 0x28) || vk == 0x2E); } catch { }
            }
            foreach(ushort code in new List<ushort>(HeldScans)){try{SendScan(code,true);}catch{}}
            foreach (int btn in HeldButtons) {
                try { SendMouseInput(btn == 0 ? MOUSEEVENTF_LEFTUP : btn == 1 ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_RIGHTUP); } catch { }
            }
        }
    }
}
