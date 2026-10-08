@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Special-method workbench launcher: finds Node.js 20+ and runs scripts\serve.mjs in this window.
rem Keep this file ASCII with CRLF line endings (.gitattributes). Chinese messages are UTF-8 text in scripts\launcher.
pushd "%~dp0"
chcp 65001 >nul
title Workbench

set "NODE="
call :find
if not defined NODE call :install
if not defined NODE goto :end

rem The server opens the browser when it is ready, or reuses the workbench already running from this folder.
call "%NODE%" "%~dp0scripts\serve.mjs" --open
if not errorlevel 1 exit /b 0
echo.
type "%~dp0scripts\launcher\stopped.txt"
:end
echo.
pause
exit /b 1

rem Each candidate is started once; one that cannot start (access denied, broken copy) or is older than 20 is skipped.
:find
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE call :try "%%N"
if not defined NODE call :try "%ProgramFiles%\nodejs\node.exe"
if not defined NODE call :try "%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE call :try "%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE call :try "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
exit /b 0

:install
echo.
type "%~dp0scripts\launcher\no-node.txt"
where winget >nul 2>nul || exit /b 0
echo.
type "%~dp0scripts\launcher\install.txt"
choice /c YN /n
if errorlevel 2 exit /b 0
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
call :find
exit /b 0

:try
if not exist "%~1" exit /b 0
call "%~1" --version >"%TEMP%\workbench-node.txt" 2>nul
set "VER="
for /f "usebackq delims=" %%V in ("%TEMP%\workbench-node.txt") do if not defined VER set "VER=%%V"
if not defined VER (
  echo   - "%~1": cannot start
  exit /b 0
)
rem Only a real "vNN.x" answer counts: anything else leaves MAJOR at 0.
set "MAJOR=0"
if /i "%VER:~0,1%"=="v" for /f "tokens=1 delims=." %%M in ("%VER:~1%") do set /a "MAJOR=%%M" 2>nul
if %MAJOR% LSS 20 (
  echo   - "%~1": %VER%, needs 20 or newer
  exit /b 0
)
set "NODE=%~1"
echo Node.js %VER%  "%NODE%"
exit /b 0
