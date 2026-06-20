@echo off
echo Starting Archery Note server for iPhone...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-iphone.ps1"
pause
