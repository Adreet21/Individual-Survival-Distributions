#!/bin/bash

# This script starts the backend, frontend, ML API, and Celery worker services in a single terminal.
# It runs all services concurrently and provides unified logging with color-coded output.

# Exit on error
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ML_API_DIR="$PROJECT_ROOT/../MakeSurvivalCalibratedAgain-MTLR-API"

# Create logs directory if it doesn't exist
LOGS_DIR="$PROJECT_ROOT/.logs"
mkdir -p "$LOGS_DIR"

# Log files
BACKEND_LOG="$LOGS_DIR/backend.log"
FRONTEND_LOG="$LOGS_DIR/frontend.log"
ML_API_LOG="$LOGS_DIR/ml_api.log"
CELERY_LOG="$LOGS_DIR/celery.log"

# PID files for tracking processes
BACKEND_PID_FILE="$LOGS_DIR/backend.pid"
FRONTEND_PID_FILE="$LOGS_DIR/frontend.pid"
ML_API_PID_FILE="$LOGS_DIR/ml_api.pid"
CELERY_PID_FILE="$LOGS_DIR/celery.pid"

# Cleanup function to kill all processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"

    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            echo -e "${RED}Stopping backend (PID: $BACKEND_PID)...${NC}"
            kill "$BACKEND_PID" 2>/dev/null || true
        fi
        rm -f "$BACKEND_PID_FILE"
    fi

    if [ -f "$FRONTEND_PID_FILE" ]; then
        FRONTEND_PID=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$FRONTEND_PID" 2>/dev/null; then
            echo -e "${GREEN}Stopping frontend (PID: $FRONTEND_PID)...${NC}"
            kill "$FRONTEND_PID" 2>/dev/null || true
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi

    if [ -f "$ML_API_PID_FILE" ]; then
        ML_API_PID=$(cat "$ML_API_PID_FILE")
        if kill -0 "$ML_API_PID" 2>/dev/null; then
            echo -e "${BLUE}Stopping ML API (PID: $ML_API_PID)...${NC}"
            kill "$ML_API_PID" 2>/dev/null || true
        fi
        rm -f "$ML_API_PID_FILE"
    fi

    if [ -f "$CELERY_PID_FILE" ]; then
        CELERY_PID=$(cat "$CELERY_PID_FILE")
        if kill -0 "$CELERY_PID" 2>/dev/null; then
            echo -e "${MAGENTA}Stopping Celery worker (PID: $CELERY_PID)...${NC}"
            kill "$CELERY_PID" 2>/dev/null || true
        fi
        rm -f "$CELERY_PID_FILE"
    fi

    # Kill any remaining child processes
    pkill -P $$ 2>/dev/null || true

    echo -e "${YELLOW}All services stopped.${NC}"
    exit 0
}

# Set up trap to cleanup on script exit or interruption
trap cleanup EXIT INT TERM

# Function to kill process running on a specific port
kill_port() {
    local port=$1
    local service_name=$2

    # Find PID of process using the port
    local pid=$(lsof -ti:$port 2>/dev/null)

    if [ -n "$pid" ]; then
        echo -e "${YELLOW}Found existing process on port $port (PID: $pid) for $service_name${NC}"
        echo -e "${YELLOW}Killing process...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1

        # Verify the process is killed
        if lsof -ti:$port >/dev/null 2>&1; then
            echo -e "${RED}Warning: Failed to kill process on port $port${NC}"
            return 1
        else
            echo -e "${GREEN}✅ Successfully freed port $port${NC}"
        fi
    fi
    return 0
}

# Function to check and recreate virtual environment if needed
check_and_setup_venv() {
    local venv_dir="$1"
    local service_name="$2"

    if [ ! -f "$venv_dir/bin/activate" ]; then
        echo -e "${YELLOW}Warning: Virtual environment for $service_name is missing or broken${NC}"
        echo -e "${YELLOW}Recreating virtual environment...${NC}"

        # Remove broken venv if it exists
        if [ -d "$venv_dir" ]; then
            rm -rf "$venv_dir"
        fi

        # Create new virtual environment
        python3 -m venv "$venv_dir"

        if [ -f "$venv_dir/bin/activate" ]; then
            echo -e "${GREEN}Virtual environment for $service_name created successfully${NC}"
        else
            echo -e "${RED}Error: Failed to create virtual environment for $service_name${NC}"
            return 1
        fi
    fi
    return 0
}

# Clear old log files and PID files
echo -e "${YELLOW}Cleaning up old logs and PID files...${NC}"
rm -f "$LOGS_DIR"/*.log "$LOGS_DIR"/*.pid
> "$BACKEND_LOG"
> "$FRONTEND_LOG"
> "$ML_API_LOG"
> "$CELERY_LOG"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Celery Setup & Service Startup${NC}"
echo -e "${CYAN}========================================${NC}"

# Check if lsof is available (needed for port checking)
if ! command -v lsof &> /dev/null; then
    echo -e "${RED}❌ lsof is not installed.${NC}"
    echo -e "${YELLOW}Please install lsof:${NC}"
    echo -e "  Ubuntu/Debian: sudo apt-get install lsof"
    echo -e "  macOS: It should be pre-installed"
    exit 1
fi

# Check if Redis is running
echo -e "\n${MAGENTA}Checking Redis...${NC}"
if ! command -v redis-cli &> /dev/null; then
    echo -e "${RED}❌ Redis is not installed.${NC}"
    echo -e "${YELLOW}Please install Redis:${NC}"
    echo -e "  Ubuntu/Debian: sudo apt-get install redis-server"
    echo -e "  macOS: brew install redis"
    exit 1
fi

if ! redis-cli ping &> /dev/null; then
    echo -e "${RED}❌ Redis is not running.${NC}"
    echo -e "${YELLOW}Please start Redis:${NC}"
    echo -e "  Ubuntu/Debian: sudo systemctl start redis"
    echo -e "  macOS: brew services start redis"
    exit 1
fi

echo -e "${GREEN}✅ Redis is running${NC}"

# Run Celery migrations (dependencies installed via requirements.txt)
echo -e "\n${MAGENTA}Running Celery migrations...${NC}"
check_and_setup_venv "$PROJECT_ROOT/venv" "Backend"

cd "$PROJECT_ROOT/isd"
source ../venv/bin/activate

python manage.py migrate django_celery_results --noinput >> "$CELERY_LOG" 2>&1 || true
python manage.py migrate django_celery_beat --noinput >> "$CELERY_LOG" 2>&1 || true

echo -e "${GREEN}✅ Celery migrations complete${NC}"
cd "$PROJECT_ROOT"

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}Checking for Existing Processes on Ports${NC}"
echo -e "${CYAN}========================================${NC}"

# Kill any existing processes on the ports we need
kill_port 8000 "Backend"
kill_port 5173 "Frontend"
kill_port 5000 "ML API"

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}Starting All Services${NC}"
echo -e "${CYAN}========================================${NC}"

# Start Backend
echo -e "\n${RED}[1/4] Starting Backend...${NC}"
check_and_setup_venv "$PROJECT_ROOT/venv" "Backend"
(
    cd "$PROJECT_ROOT"
    source venv/bin/activate
    pip install -r requirements.txt > "$BACKEND_LOG" 2>&1
    cd isd
    python3 manage.py runserver 0.0.0.0:8000 >> "$BACKEND_LOG" 2>&1
) &
BACKEND_PID=$!
echo $BACKEND_PID > "$BACKEND_PID_FILE"
echo -e "${RED}Backend started with PID: $BACKEND_PID${NC}"

# Start Frontend
echo -e "\n${GREEN}[2/4] Starting Frontend...${NC}"
(
    cd "$PROJECT_ROOT/frontend"
    npm install > "$FRONTEND_LOG" 2>&1
    npm run dev >> "$FRONTEND_LOG" 2>&1
) &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
echo -e "${GREEN}Frontend started with PID: $FRONTEND_PID${NC}"

# Start ML API
echo -e "\n${BLUE}[3/4] Starting ML API...${NC}"
if [ -d "$ML_API_DIR" ]; then
    check_and_setup_venv "$ML_API_DIR/venv" "ML API"
    (
        cd "$ML_API_DIR"
        source venv/bin/activate
        pip install -r requirements.txt > "$ML_API_LOG" 2>&1
        python3 app.py >> "$ML_API_LOG" 2>&1
    ) &
    ML_API_PID=$!
    echo $ML_API_PID > "$ML_API_PID_FILE"
    echo -e "${BLUE}ML API started with PID: $ML_API_PID${NC}"
else
    echo -e "${YELLOW}Warning: ML API directory not found at $ML_API_DIR${NC}"
fi

# Start Celery Worker
echo -e "\n${MAGENTA}[4/4] Starting Celery Worker...${NC}"
(
    cd "$PROJECT_ROOT"
    source venv/bin/activate
    cd isd
    celery -A isd worker --loglevel=info >> "$CELERY_LOG" 2>&1
) &
CELERY_PID=$!
echo $CELERY_PID > "$CELERY_PID_FILE"
echo -e "${MAGENTA}Celery worker started with PID: $CELERY_PID${NC}"

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}All Services Started!${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${RED}Backend:${NC}  http://0.0.0.0:8000 (Log: .logs/backend.log)"
echo -e "${GREEN}Frontend:${NC} Check .logs/frontend.log for URL"
echo -e "${BLUE}ML API:${NC}   Check .logs/ml_api.log for URL"
echo -e "${MAGENTA}Celery:${NC}   Worker running (Log: .logs/celery.log)"
echo -e "\n${YELLOW}Press Ctrl+C to stop all services${NC}"
echo -e "${CYAN}========================================${NC}\n"

# Function to tail logs with color coding
tail_logs() {
    tail -f "$BACKEND_LOG" "$FRONTEND_LOG" "$ML_API_LOG" "$CELERY_LOG" 2>/dev/null | while read -r line; do
        case "$line" in
            *backend.log*)
                echo -e "${RED}[BACKEND]${NC} $line"
                ;;
            *frontend.log*)
                echo -e "${GREEN}[FRONTEND]${NC} $line"
                ;;
            *ml_api.log*)
                echo -e "${BLUE}[ML-API]${NC} $line"
                ;;
            *celery.log*)
                echo -e "${MAGENTA}[CELERY]${NC} $line"
                ;;
            *)
                echo "$line"
                ;;
        esac
    done
}

# Show combined logs
echo -e "${WHITE}Combined service logs (press Ctrl+C to stop):${NC}\n"
tail_logs &
TAIL_PID=$!

# Wait for all background processes
wait
