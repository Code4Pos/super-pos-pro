@echo off
REM ============================================================================
REM SiamPOS Pro — สคริปต์เปิดโหมดจัดการหลังร้าน (Admin) บนคอมพิวเตอร์ Windows แบบหน้าต่างแอป
REM ============================================================================

REM แก้ไข URL ด้านล่างเป็น URL ของร้านคุณ (เช่น GitHub Pages หรือโดเมน VPS ของร้าน)
set "ADMIN_URL=http://localhost:5173/admin.html"
if not "%~1"=="" set "ADMIN_URL=%~1"

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%ADMIN_URL%" --start-maximized
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%ADMIN_URL%" --start-maximized
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%ADMIN_URL%" --start-maximized
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%ADMIN_URL%" --start-maximized
    exit /b 0
)

start "" "%ADMIN_URL%"
