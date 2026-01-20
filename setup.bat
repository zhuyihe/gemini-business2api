@echo off
REM Gemini Business2API Setup Script
REM Handles both installation and updates automatically
REM Uses uv for Python environment management
REM Usage: setup.bat

setlocal enabledelayedexpansion

echo ==========================================
echo Gemini Business2API Setup Script
echo ==========================================
echo.

REM Color codes for output (using echo instead of ANSI codes for better Windows compatibility)
set GREEN=[92m
set RED=[91m
set YELLOW=[93m
set BLUE=[94m
set NC=[0m

REM Function to print colored messages (simplified for Windows)
set "PRINT_SUCCESS=echo [SUCCESS]"
set "PRINT_ERROR=echo [ERROR]"
set "PRINT_INFO=echo [INFO]"
set "PRINT_STEP=echo [STEP]"

REM Check if git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed. Please install git first.
    exit /b 1
)

REM Step 1: Install or update uv
echo [STEP] Step 1: Installing/Updating uv...

where uv >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] uv not found, installing...
    REM Install uv using pipx or pip
    pipx install uv 2>nul 
    if %errorlevel% neq 0 (
        pip install --user uv 2>nul
        if %errorlevel% neq 0 (
            REM Fallback: download and install uv binary
            curl -LsSf https://astral.sh/uv/install.bat | cmd
        )
    )
    if %errorlevel% equ 0 (
        echo [SUCCESS] uv installed successfully
    ) else (
        echo [ERROR] Failed to install uv
        exit /b 1
    )
) else (
    echo [INFO] Updating uv to latest version...
    uv pip install --upgrade uv
    echo [SUCCESS] uv updated
)
echo.

REM Step 2: Ensure Python 3.11 is available
echo [STEP] Step 2: Ensuring Python 3.11 is available...
uv python list | findstr /C:"3.11" >nul
if %errorlevel% neq 0 (
    echo [INFO] Python 3.11 not found, installing...
    uv python install 3.11
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Python 3.11
        exit /b 1
    )
    echo [SUCCESS] Python 3.11 installed
) else (
    echo [SUCCESS] Python 3.11 is already available
)
echo.

REM Step 3: Pull latest code from git
echo [STEP] Step 3: Syncing code from repository...
echo [INFO] Fetching latest changes...
git fetch origin

echo [INFO] Pulling latest code...
git pull origin main 2>nul || git pull origin master 2>nul
if %errorlevel% equ 0 (
    echo [SUCCESS] Code synchronized successfully
) else (
    echo [INFO] No remote changes to pull
)
echo.

REM Step 4: Setup .env file if it doesn't exist
echo [STEP] Step 4: Checking configuration...
if exist .env (
    echo [INFO] .env file exists
) else (
    if exist .env.example (
        copy .env.example .env >nul
        echo [SUCCESS] .env file created from .env.example
        echo [INFO] Please edit .env and configure your ADMIN_KEY
    ) else (
        echo [ERROR] .env.example not found
        exit /b 1
    )
)
echo.

REM Step 5: Setup Python virtual environment
echo [STEP] Step 5: Setting up Python environment...
if exist .venv (
    echo [INFO] Virtual environment already exists
) else (
    echo [INFO] Creating virtual environment with Python 3.11...
    uv venv --python 3.11 .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment
        exit /b 1
    )
    echo [SUCCESS] Virtual environment created
)
echo.

REM Step 6: Install/Update Python dependencies
echo [STEP] Step 6: Installing Python dependencies...
echo [INFO] Using uv to install dependencies (this may take a moment)...
.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
uv pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies
    exit /b 1
)
echo [SUCCESS] Python dependencies installed
echo.

REM Step 7: Setup frontend
echo [STEP] Step 7: Setting up frontend...
if exist frontend (
    cd frontend

    REM Check if npm is installed
    where npm >nul 2>nul
    if %errorlevel% equ 0 (
        echo [INFO] Installing dependencies...
        npm install

        echo [INFO] Building frontend...
        npm run build
        echo [SUCCESS] Frontend built successfully
    ) else (
        echo [ERROR] npm is not installed. Please install Node.js and npm first.
        cd ..
        exit /b 1
    )

    cd ..
) else (
    echo [ERROR] Frontend directory not found. Are you in the project root?
    exit /b 1
)
echo.

REM Step 8: Show completion message
echo ==========================================
echo [SUCCESS] Setup completed successfully!
echo ==========================================
echo.

if exist .env (
    echo [INFO] Next steps:
    echo.
    echo   1. Edit .env file if needed:
    echo      notepad .env
    echo.
    echo   2. Start the service:
    echo      .venv\Scripts\python.exe main.py
    echo.
    echo   3. Access the admin panel:
    echo      http://localhost:7860/
    echo.
    echo [INFO] To activate virtual environment later, run:
    echo   .venv\Scripts\activate.bat
)
echo.

endlocal
