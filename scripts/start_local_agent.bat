@echo off
title NESAC MPR Local Processing Agent (127.0.0.1:8765)
echo Starting NESAC MPR Local Processing Agent on http://127.0.0.1:8765 ...
echo Default MPR Folder: W:\REKHA\17-11-2026\MPR
echo.
cd /d "%~dp0\..\python_agent"
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)
python agent_server.py
pause
