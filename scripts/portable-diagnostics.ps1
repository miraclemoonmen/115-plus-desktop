param([int]$AppPid, [string]$Root)
$ErrorActionPreference = 'Continue'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class PortableWindows {
  public delegate bool Callback(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, Callback cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  public static void Dump(uint pid) {
    Callback text = (h,l) => { var b=new StringBuilder(4096);GetWindowText(h,b,b.Capacity);if(b.Length>0)Console.WriteLine(b.ToString());return true; };
    EnumWindows((h,l) => { uint owner; GetWindowThreadProcessId(h,out owner); if(owner==pid){text(h,l);EnumChildWindows(h,text,IntPtr.Zero);}return true; },IntPtr.Zero);
  }
}
'@
[PortableWindows]::Dump($AppPid)
Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $AppPid -or $_.Name -eq 'msedgewebview2.exe' } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Depth 3
Get-ChildItem (Join-Path $Root 'data') -Recurse -ErrorAction SilentlyContinue | Select-Object FullName,Length | ConvertTo-Json -Depth 2
Get-ChildItem (Join-Path $Root 'data/logs') -File -ErrorAction SilentlyContinue | ForEach-Object { Get-Content $_.FullName -Tail 35 }
