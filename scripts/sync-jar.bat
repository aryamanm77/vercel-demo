@echo off
setlocal
set SRC_JAR=%~dp0..\..\exam-bank-system\qbank-standalone\target\qbank-standalone-1.0.0.jar
set DST_JAR=%~dp0..\app\qbank-standalone-1.0.0.jar
if not exist "%SRC_JAR%" (
  echo Source JAR not found: %SRC_JAR%
  echo Run mvn -B package in ..\exam-bank-system first.
  exit /b 1
)
copy /y "%SRC_JAR%" "%DST_JAR%"
echo Synced %DST_JAR%
