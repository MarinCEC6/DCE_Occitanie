@echo off
cd /d "%~dp0"
echo Serving Occitanie explorer from %cd% on http://localhost:8010
python -m http.server 8010
