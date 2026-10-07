using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

// Core Audio session attenuation. EOF, RESTORE and EXIT restore only volumes we still own.
class AudioSessionHost {
    class Saved { public ISimpleAudioVolume Volume; public float Original,Applied; public bool UserChanged; }
    static readonly Dictionary<string,Saved> saved=new Dictionary<string,Saved>();
    static Guid context=new Guid("8c14cfaa-b070-43ae-bcd1-913f952b2474");
    static HashSet<uint> excluded=new HashSet<uint>();
    static HashSet<uint> targets=null;
    static void Check(int hr){Marshal.ThrowExceptionForHR(hr);}
    static void Restore(){foreach(var s in saved.Values){try{float current;Check(s.Volume.GetMasterVolume(out current));if(!s.UserChanged && Math.Abs(current-s.Applied)<0.002f)Check(s.Volume.SetMasterVolume(s.Original,ref context));}catch{}finally{Marshal.ReleaseComObject(s.Volume);}}saved.Clear();}
    static void Duck(float amount){
        if(amount<=0){Restore();return;}
        var enumerator=(IMMDeviceEnumerator)new DeviceEnumerator();IMMDeviceCollection devices=null;
        try{Check(enumerator.EnumAudioEndpoints(0,1,out devices));uint count;Check(devices.GetCount(out count));for(uint d=0;d<count;d++){
            IMMDevice device=null;object managerObject=null;IAudioSessionEnumerator sessions=null;
            try{Check(devices.Item(d,out device));Guid iid=typeof(IAudioSessionManager2).GUID;Check(device.Activate(ref iid,23,IntPtr.Zero,out managerObject));var manager=(IAudioSessionManager2)managerObject;Check(manager.GetSessionEnumerator(out sessions));int n;Check(sessions.GetCount(out n));for(int i=0;i<n;i++){
                IAudioSessionControl2 control=null;bool retained=false;
                try{Check(sessions.GetSession(i,out control));uint pid;Check(control.GetProcessId(out pid));if(pid==0 || excluded.Contains(pid) || targets!=null&&!targets.Contains(pid))continue;string id;Check(control.GetSessionInstanceIdentifier(out id));var volume=(ISimpleAudioVolume)control;float current;Check(volume.GetMasterVolume(out current));Saved state;if(!saved.TryGetValue(id,out state)){state=new Saved{Volume=volume,Original=current,Applied=current};saved.Add(id,state);retained=true;}else if(Math.Abs(current-state.Applied)>0.002f)state.UserChanged=true;if(!state.UserChanged){state.Applied=state.Original*(1-amount);Check(state.Volume.SetMasterVolume(state.Applied,ref context));}
                }catch{}finally{if(control!=null&&!retained)Marshal.ReleaseComObject(control);}
            }}catch{}finally{if(sessions!=null)Marshal.ReleaseComObject(sessions);if(managerObject!=null)Marshal.ReleaseComObject(managerObject);if(device!=null)Marshal.ReleaseComObject(device);}
        }}finally{if(devices!=null)Marshal.ReleaseComObject(devices);Marshal.ReleaseComObject(enumerator);}
    }
    [MTAThread] static void Main(string[] args){
        // Tests can restrict this helper to an owned fixture PID, never an unrelated application.
        foreach(var arg in args){if(arg.StartsWith("--exclude="))foreach(var p in arg.Substring(10).Split(',')){uint id;if(uint.TryParse(p,out id))excluded.Add(id);}else if(arg.StartsWith("--only=")){targets=new HashSet<uint>();foreach(var p in arg.Substring(7).Split(',')){uint id;if(uint.TryParse(p,out id))targets.Add(id);}}}
        try{Console.WriteLine("READY");Task<string> next=null;while(true){if(next==null)next=Task.Factory.StartNew(()=>Console.ReadLine());if(!next.Wait(3000)){Restore();continue;}string line=next.Result;next=null;if(line==null||line=="EXIT")break;try{if(line=="RESTORE")Restore();else if(line.StartsWith("DUCK ")){float value;if(!float.TryParse(line.Substring(5),NumberStyles.Float,CultureInfo.InvariantCulture,out value)||value<0||value>1)throw new ArgumentException();Duck(value);}else if(line!="PING")throw new ArgumentException();Console.WriteLine("OK");}catch(Exception e){Console.Error.WriteLine(e.GetType().Name+" "+e.Message);Console.WriteLine("ERROR");}}}finally{Restore();}
    }
}
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator{}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator {
 [PreserveSig]int EnumAudioEndpoints(int flow,uint state,out IMMDeviceCollection devices);
 [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);
}
[ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceCollection {
 [PreserveSig]int GetCount(out uint count);[PreserveSig]int Item(uint index,out IMMDevice device);
}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice {
 [PreserveSig]int Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object instance);
}
[ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionManager2 {
 [PreserveSig]int GetAudioSessionControl(IntPtr guid,uint flags,out IntPtr control);
 [PreserveSig]int GetSimpleAudioVolume(IntPtr guid,uint flags,out IntPtr volume);
 [PreserveSig]int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
}
[ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionEnumerator {
 [PreserveSig]int GetCount(out int count);
 [PreserveSig]int GetSession(int index,out IAudioSessionControl2 session);
}
[ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionControl2 {
 [PreserveSig]int GetState(out int state);
 [PreserveSig]int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)]out string name);
 [PreserveSig]int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)]string name,ref Guid context);
 [PreserveSig]int GetIconPath([MarshalAs(UnmanagedType.LPWStr)]out string path);
 [PreserveSig]int SetIconPath([MarshalAs(UnmanagedType.LPWStr)]string path,ref Guid context);
 [PreserveSig]int GetGroupingParam(out Guid grouping);
 [PreserveSig]int SetGroupingParam(ref Guid grouping,ref Guid context);
 [PreserveSig]int RegisterAudioSessionNotification(IntPtr events);
 [PreserveSig]int UnregisterAudioSessionNotification(IntPtr events);
 [PreserveSig]int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);
 [PreserveSig]int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);
 [PreserveSig]int GetProcessId(out uint pid);
}
[ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISimpleAudioVolume {
 [PreserveSig]int SetMasterVolume(float volume,ref Guid context);
 [PreserveSig]int GetMasterVolume(out float volume);
 [PreserveSig]int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,ref Guid context);
 [PreserveSig]int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
}
