@echo off
chcp 65001 >nul
echo ====================================================
echo   ساخت میانبر سیستم پزشک (مطب دکتر بهامین جهانیان)
echo ====================================================
echo.
set /p SERVER_IP=لطفاً آی‌پی سیستم منشی را وارد کنید (مثلاً 192.168.1.10): 

if "%SERVER_IP%"=="" (
  echo آی‌پی وارد نشد.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$sc = $ws.CreateShortcut((Join-Path $desktop 'مطب دکتر جهانیان (پزشک).lnk')); " ^
  "$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; " ^
  "if (Test-Path $edge) { $sc.TargetPath = $edge; $sc.Arguments = '--app=http://%SERVER_IP%:3000'; } " ^
  "else { $sc.TargetPath = 'http://%SERVER_IP%:3000'; } " ^
  "$sc.IconLocation = 'shell32.dll,21'; " ^
  "$sc.Save()"

echo.
echo میانبر «مطب دکتر جهانیان (پزشک)» روی دسکتاپ ساخته شد!
pause
