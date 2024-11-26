@echo off
chcp 65001
cd release
node --experimental-specifier-resolution=node dist/test/index.js
pause
