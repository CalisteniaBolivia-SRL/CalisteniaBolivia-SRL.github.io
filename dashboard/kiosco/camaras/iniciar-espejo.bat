@echo off
rem Espejo de cámaras del centro de mando: sube una foto de la pantalla de SmartPSS cada 10 segundos.
rem Copie esta carpeta a C:\camaras (espejo.ps1, este archivo y espejo.config.json con la clave de esta PC).
rem Para que arranque solo: Windows + R, escriba shell:startup y pegue ahí un acceso directo a este archivo.
cd /d C:\camaras
start "Espejo de camaras" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\camaras\espejo.ps1"
