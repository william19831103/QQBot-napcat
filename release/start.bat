@echo off
chcp 65001
cd test
node --experimental-modules --es-module-specifier-resolution=node ..\dist\test\index.js
pause
