@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installing required files...
  call npm install
)
echo Opening India's Branded Sports website...
start "" http://localhost:3000
start "" http://localhost:3000/admin
call npm start
pause
