@echo off
rem 本文件必须保存为 GBK 编码 + CRLF 换行(cmd 中文环境标准),勿用编辑器直接改回 UTF-8
cd /d %~dp0
title 模拟盘 · 股票学习

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js,请先安装:https://nodejs.org/
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [初始化] 安装后端依赖,首次需要几分钟...
  call npm --prefix server install
  if errorlevel 1 ( echo [错误] 后端依赖安装失败 & pause & exit /b 1 )
)

if not exist "web\dist" (
  echo [初始化] 安装前端依赖并构建页面...
  call npm --prefix web install
  call npm --prefix web run build
  if errorlevel 1 ( echo [错误] 前端构建失败 & pause & exit /b 1 )
)

echo [启动] 服务运行中,浏览器将自动打开 http://localhost:8090
echo        若浏览器未自动打开,请手动访问该地址;关闭本窗口即退出程序
start "" cmd /c "timeout /t 2 >nul && start http://localhost:8090"
node server\src\index.js
pause
