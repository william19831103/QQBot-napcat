@echo off
:: 设置控制台代码页为UTF-8以支持中文显示
chcp 65001

echo 开始构建项目...

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo 安装依赖...
    call npm install
)

:: 等待一会儿确保文件释放
timeout /t 2 /nobreak > nul

:: 清理旧的构建文件
echo 清理旧文件...
if exist "dist" (
    rd /s /q "dist" 2>nul || (
        echo 无法删除 dist 目录，请确保没有其他程序正在使用
        exit /b 1
    )
)
if exist "release" (
    rd /s /q "release" 2>nul || (
        echo 无法删除 release 目录，请确保没有其他程序正在使用
        exit /b 1
    )
)

:: 编译 TypeScript
echo 编译项目...
call npx tsc

:: 检查编译是否成功
if errorlevel 1 (
    echo TypeScript 编译失败！
    pause
    exit /b 1
)

:: 创建发布目录结构
echo 创建发布目录...
mkdir release
mkdir release\dist
mkdir release\dist\src
mkdir release\dist\test

:: 复制编译后的文件和依赖
echo 复制文件...
xcopy /Y /E /I "dist\src" "release\dist\src\"
xcopy /Y /E /I "dist\test" "release\dist\test\"
copy /Y "test\config.json" "release\dist\test" >nul 2>&1
if exist "test\cdkey.txt" copy /Y "test\cdkey.txt" "release\dist\test\" >nul 2>&1

:: 下载 Node.js 可执行文件
echo 下载 Node.js...
powershell -Command "& {Invoke-WebRequest -Uri 'https://nodejs.org/dist/v14.15.3/win-x64/node.exe' -OutFile 'release\node.exe'}"

:: 创建启动脚本
echo 创建启动脚本...
(
echo @echo off
echo chcp 65001
echo cd test
echo echo 正在启动QQ机器人...
echo ..\node.exe ..\dist\test\index.js
echo pause
) > "release\start.bat"

:: 创建 package.json
echo 创建 package.json...
(
echo {
echo   "name": "qq-bot",
echo   "version": "1.0.0",
echo   "type": "module",
echo   "dependencies": {
echo     "node-fetch": "^3.3.2",
echo     "form-data": "^4.0.0",
echo     "ws": "^8.18.0",
echo     "isomorphic-ws": "^5.0.0",
echo     "nanoid": "^3.3.7"
echo   }
echo }
) > "release\package.json"

:: 安装依赖
echo 安装依赖...
cd release
call npm install --production
cd ..

echo 打包完成！发布文件在 release 目录中。
echo 请运行 start.bat 启动机器人。
pause 