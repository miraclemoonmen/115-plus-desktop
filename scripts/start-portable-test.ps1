param([Parameter(Mandatory)][string]$Exe)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# CI only: create a medium-integrity token for the same user, without administrator
# membership. This neither registers a service nor modifies machine policies.
Add-Type @'
using System;
using System.Text;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class PortableUserProcess {
  [StructLayout(LayoutKind.Sequential)] struct SidAttributes { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public uint cb; public string reserved, desktop, title;
    public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
    public ushort show, reservedSize; public IntPtr reservedData,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public uint pid,tid; }
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr handle);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSid(string text,out IntPtr sid);
  [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr original,uint flags,uint disabledCount,SidAttributes[] disabled,uint privilegeCount,IntPtr privileges,uint restrictedCount,IntPtr restricted,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int kind,ref SidAttributes info,uint size);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessAsUser(IntPtr token,string app,StringBuilder args,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfo startup,out ProcessInfo process);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessWithTokenW(IntPtr token,uint logon,string app,StringBuilder args,uint flags,IntPtr environment,string cwd,ref StartupInfo startup,out ProcessInfo process);
  static void Check(bool success) { if(!success)throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static int Run(string exe) {
    IntPtr original=IntPtr.Zero, token=IntPtr.Zero, admin=IntPtr.Zero, medium=IntPtr.Zero;
    var process=new ProcessInfo();
    try {
      Check(OpenProcessToken(GetCurrentProcess(),0xF01FF,out original));
      Check(ConvertStringSidToSid("S-1-5-32-544",out admin));
      Check(CreateRestrictedToken(original,1,1,new[]{new SidAttributes{Sid=admin}},0,IntPtr.Zero,0,IntPtr.Zero,out token));
      Check(ConvertStringSidToSid("S-1-16-8192",out medium));
      var label=new SidAttributes{Sid=medium,Attributes=0x20};
      Check(SetTokenInformation(token,25,ref label,(uint)Marshal.SizeOf(typeof(SidAttributes))+GetLengthSid(medium)));
      var startup=new StartupInfo{cb=(uint)Marshal.SizeOf(typeof(StartupInfo)),desktop="winsta0\\default"};
      var args=new StringBuilder("\""+exe+"\"");
      bool created=CreateProcessAsUser(token,exe,args,IntPtr.Zero,IntPtr.Zero,false,0x400,IntPtr.Zero,Directory.GetCurrentDirectory(),ref startup,out process);
      if(!created) Check(CreateProcessWithTokenW(token,0,exe,new StringBuilder("\""+exe+"\""),0x400,IntPtr.Zero,Directory.GetCurrentDirectory(),ref startup,out process));
      Console.WriteLine("PORTABLE_APP_PID="+process.pid);Console.Out.Flush();
      WaitForSingleObject(process.process,0xFFFFFFFF);
      uint code;Check(GetExitCodeProcess(process.process,out code));return unchecked((int)code);
    } finally {
      if(process.thread!=IntPtr.Zero)CloseHandle(process.thread);
      if(process.process!=IntPtr.Zero)CloseHandle(process.process);
      if(token!=IntPtr.Zero)CloseHandle(token);
      if(original!=IntPtr.Zero)CloseHandle(original);
      if(admin!=IntPtr.Zero)LocalFree(admin);
      if(medium!=IntPtr.Zero)LocalFree(medium);
    }
  }
}
'@
exit [PortableUserProcess]::Run($Exe)
