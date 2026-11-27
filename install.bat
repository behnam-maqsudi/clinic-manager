@echo off
cd /d "%~dp0"
echo Installing Clinic Manager...

where git >nul 2>nul
if %errorlevel% neq 0 (
  echo Installing Git...
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
)

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
)

call npm install
if %errorlevel% neq 0 (
  echo npm install failed. Check your internet connection.
  pause
  exit /b 1
)

call npm run build
if %errorlevel% neq 0 (
  echo Frontend build failed.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $sc = $ws.CreateShortcut((Join-Path $desktop 'Clinic Manager.lnk')); $sc.TargetPath = '%~dp0ClinicManager.vbs'; $sc.WorkingDirectory = '%~dp0'; $sc.IconLocation = 'shell32.dll,21'; $sc.Save()"

netsh advfirewall firewall show rule name="ClinicManager3000" >nul 2>nul
if %errorlevel% neq 0 (
  netsh advfirewall firewall add rule name="ClinicManager3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>nul
)

echo Done! You can now open "Clinic Manager" from your Desktop.
pause
