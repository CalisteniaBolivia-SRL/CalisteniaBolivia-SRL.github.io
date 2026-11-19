@echo off
rem Pantalla central del muro: asistente Capital Corp.
rem Abre Chrome a pantalla completa con sonido y microfono permitidos, sin preguntar y sin tocar nada.
rem Usa un perfil propio de Chrome: la primera vez hay que ingresar al centro de mando con el usuario del muro.
set "URL=https://calisteniabolivia-srl.github.io/dashboard/asistente.html"
set "PERFIL=%LOCALAPPDATA%\CapitalCorpMuro"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
start "" "%CHROME%" --user-data-dir="%PERFIL%" --kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream --no-first-run --disable-session-crashed-bubble "%URL%"
