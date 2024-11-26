@echo off
:: 设置UTF-8编码
chcp 65001

echo 开始构建项目...

:: 检查并安装依赖
if not exist "node_modules" (
    echo 安装依赖...
    call npm install
)

:: 编译TypeScript
echo 编译TypeScript...
call npx tsc

:: 创建发布目录
echo 创建发布目录...
if exist "release" (
    rd /s /q "release"
)
mkdir release

:: 复制编译后的文件
echo 复制文件...
xcopy /Y /E /I "dist" "release\dist\"

:: 复制配置文件和资源
echo 复制配置文件...
mkdir "release\test"
copy /Y "test\config.json" "release\test\" >nul
copy /Y "test\cdkey.txt" "release\test\" >nul 2>&1
copy /Y "test\used_cdkeys.json" "release\test\" >nul 2>&1
copy /Y "test\kicked_users.txt" "release\test\" >nul 2>&1

:: 复制依赖
echo 复制依赖...
xcopy /Y /E /I "node_modules" "release\node_modules\"

:: 复制package.json和package-lock.json
copy /Y "package.json" "release\" >nul
copy /Y "package-lock.json" "release\" >nul

:: 创建启动脚本
echo 创建启动脚本...
(
echo @echo off
echo chcp 65001
echo cd test
echo node --experimental-modules --es-module-specifier-resolution=node ..\dist\test\index.js
echo pause
) > "release\start.bat"

echo 打包完成！
echo 运行release目录下的start.bat即可启动程序
pause 