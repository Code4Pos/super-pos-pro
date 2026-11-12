@echo off
REM ============================================================================
REM SiamPOS Pro — สคริปต์เปิดโหมดขายหน้าร้านบนคอมพิวเตอร์ Windows (Kiosk + พิมพ์ใบเสร็จอัตโนมัติ)
REM คุณสมบัติ:
REM   1. --app=...          เปิดแบบหน้าต่างแอปเต็มจอ ไม่มีแถบ URL
REM   2. --start-fullscreen เปิดเต็มหน้าจอทันทีเหมาะกับจอสัมผัส / เครื่องแคชเชียร์
REM   3. --kiosk-printing   สั่งพิมพ์ใบเสร็จออกเครื่องพิมพ์ค่าเริ่มต้นทันทีโดยไม่เด้งหน้าต่างถาม
REM ============================================================================

REM แก้ไข URL ด้านล่างเป็น URL ของร้านคุณ (เช่น GitHub Pages หรือโดเมน VPS ของร้าน)
set "POS_URL=http://localhost:5173/index.html?mode=pos"
if not "%~1"=="" set "POS_URL=%~1"

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%POS_URL%" --start-fullscreen --kiosk-printing
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%POS_URL%" --start-fullscreen --kiosk-printing
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%POS_URL%" --start-fullscreen --kiosk-printing
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%POS_URL%" --start-fullscreen --kiosk-printing
    exit /b 0
)

start "" "%POS_URL%"
