@echo off
chcp 65001 >nul
cd /d %~dp0
title 模拟盘 · 股票学习

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js,请先安装:https://nodejs.org/
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [初始化] 安装后端依赖...
  call npm --prefix server install
  if errorlevel 1 ( echo [错误] 后端依赖安装失败 & pause & exit /b 1 )
)

if not exist "web\dist" (
  echo [初始化] 安装前端依赖并构建...
  call npm --prefix web install
  call npm --prefix web run build
  if errorlevel 1 ( echo [错误] 前端构建失败 & pause & exit /b 1 )
)

echo [启动] 服务运行中,浏览器将自动打开 http://localhost:8090
start "" cmd /c "timeout /t 2 >nul && start http://localhost:8090"
node server\src\index.js
pause
