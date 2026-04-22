@echo off
cd /d C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools
start "CVT Test Watcher" /MIN node scripts\test-watch.js
echo Test watcher started in background window.
