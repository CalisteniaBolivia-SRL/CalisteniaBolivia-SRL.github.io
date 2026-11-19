@echo off
rem Pantalla central del muro: asistente Capital Corp.
rem Opcional: abre el asistente a pantalla completa al encender (ponerlo en shell:startup).
rem Los permisos de microfono, camara y sonido los da autorizar-este-equipo.reg (una sola vez).
set "URL=https://calisteniabolivia-srl.github.io/dashboard/asistente.html"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
start "" "%CHROME%" --kiosk --no-first-run --disable-session-crashed-bubble "%URL%"
