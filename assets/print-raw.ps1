# Club POS - send RAW bytes to a Windows printer queue (ESC/POS direct printing).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File print-raw.ps1 -Printer "Name" -DocName "Job" -DataBase64 "..."
param(
  [string]$Printer,
  [string]$DocName,
  [string]$DataBase64
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ClubPosRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DocInfo {
    public string pDocName;
    public string pOutputFile;
    public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DocInfo pDocInfo);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
'@

$ErrorActionPreference = 'Stop'
$bytes = [Convert]::FromBase64String($DataBase64)

$hPrinter = [IntPtr]::Zero
if (-not [ClubPosRawPrinter]::OpenPrinter($Printer, [ref]$hPrinter, [IntPtr]::Zero)) {
  $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Output ("ERR:OpenPrinter failed, code " + $code)
  exit 1
}

try {
  $di = New-Object ClubPosRawPrinter+DocInfo
  $di.pDocName = $DocName
  $di.pDataType = "RAW"

  if (-not [ClubPosRawPrinter]::StartDocPrinter($hPrinter, 1, $di)) {
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Output ("ERR:StartDocPrinter failed, code " + $code)
    exit 1
  }
  if (-not [ClubPosRawPrinter]::StartPagePrinter($hPrinter)) {
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Output ("ERR:StartPagePrinter failed, code " + $code)
    exit 1
  }
  $written = 0
  if (-not [ClubPosRawPrinter]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) {
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Output ("ERR:WritePrinter failed, code " + $code)
    exit 1
  }
  [ClubPosRawPrinter]::EndPagePrinter($hPrinter) | Out-Null
  [ClubPosRawPrinter]::EndDocPrinter($hPrinter) | Out-Null
  Write-Output "OK"
} finally {
  [ClubPosRawPrinter]::ClosePrinter($hPrinter) | Out-Null
}
