@echo off
rem Puente de cámaras del centro de mando. Copie esta carpeta a C:\camaras (go2rtc.exe, go2rtc.yaml y este archivo).
rem Para que arranque solo: Windows + R, escriba shell:startup y pegue ahí un acceso directo a este archivo.
cd /d C:\camaras
start "Puente de cámaras" /min go2rtc.exe -config go2rtc.yaml
