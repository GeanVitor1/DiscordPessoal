using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace MeuApp.NativeInput
{
    static class Program
    {
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
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
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
            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_MOUSE;
            inputs[0].u.mi.dwFlags = flags;
            inputs[0].u.mi.dx = dx;
            inputs[0].u.mi.dy = dy;
            inputs[0].u.mi.mouseData = data;
            inputs[0].u.mi.time = 0;
            inputs[0].u.mi.dwExtraInfo = IntPtr.Zero;
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        static void MoveToAbsolute(int x, int y)
        {
            // SetCursorPos directly sets the physical Windows cursor position
            SetCursorPos(x, y);

            // Also send MOUSEEVENTF_MOVE to trigger window hover/enter/move events
            int vLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
            int vTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
            int vWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            int vHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            if (vWidth <= 0) vWidth = 1920;
            if (vHeight <= 0) vHeight = 1080;

            int normX = (int)Math.Round(((double)(x - vLeft) * 65535.0) / (double)vWidth);
            int normY = (int)Math.Round(((double)(y - vTop) * 65535.0) / (double)vHeight);

            SendMouseInput(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | 0x4000 /* MOUSEEVENTF_VIRTUALDESK */, normX, normY);
        }

        static void SendKeyInput(ushort vkCode, bool isKeyUp, bool isExtended = false)
        {
            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = vkCode;
            inputs[0].u.ki.wScan = 0;
            inputs[0].u.ki.dwFlags = (isKeyUp ? KEYEVENTF_KEYUP : 0) | (isExtended ? KEYEVENTF_EXTENDEDKEY : 0);
            inputs[0].u.ki.time = 0;
            inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        static ushort MapKeyToVk(string key)
        {
            if (string.IsNullOrEmpty(key)) return 0;
            string upper = key.ToUpperInvariant();

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
            // Self-contained loop reading line-delimited JSON or space-delimited commands from stdin
            Console.WriteLine("READY");
            Console.Out.Flush();

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line.Equals("EXIT", StringComparison.OrdinalIgnoreCase)) break;

                try
                {
                    string[] parts = line.Split(' ');
                    string cmd = parts[0].ToUpperInvariant();

                    switch (cmd)
                    {
                        case "MOVE":
                            if (parts.Length >= 3)
                            {
                                int x = int.Parse(parts[1]);
                                int y = int.Parse(parts[2]);
                                MoveToAbsolute(x, y);
                                Console.WriteLine("OK MOVE");
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

                Console.Out.Flush();
            }
        }
    }
}
