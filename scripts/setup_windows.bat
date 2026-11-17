@echo off
title NESAC MPR Intelligence Agent - Windows Setup
echo ============================================================================
echo   NESAC MPR Intelligence Agent - Windows 10/11 Setup Script
echo ============================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.10+ is not installed or not in PATH.
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Node.js not found. If running only the Python Local Agent to connect
    echo to the web UI, Python alone is sufficient. For full offline local hosting, install Node.js 20+.
)

echo [1/3] Creating Python virtual environment in python_agent\.venv ...
cd /d "%~dp0\..\python_agent"
python -m venv .venv
call .venv\Scripts\activate.bat

echo [2/3] Installing Python dependencies (python-docx, lxml, pandas, openpyxl, fastapi, uvicorn)...
pip install --upgrade pip
pip install -r requirements.txt

echo [3/3] Generating sample test DOCX files in test_data\ ...
cd /d "%~dp0\.."
python scripts\create_test_docx.py

echo.
echo Setup complete! Run scripts\start_local_agent.bat to start the local Windows folder agent on http://127.0.0.1:8765
pause
