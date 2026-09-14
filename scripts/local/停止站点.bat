@echo off
chcp 65001 >nul
title DDyu Site - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-local.ps1"
pause
