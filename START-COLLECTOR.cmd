@echo off
cd /d "%~dp0"
"%~dp0..\reels-downloader\.venv\Scripts\python.exe" "%~dp0local-collector.py"
pause
