@echo off
chcp 65001 >nul
title DDyu Site - Starting
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" -Open
pause
