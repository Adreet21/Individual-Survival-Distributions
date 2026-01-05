#!/bin/bash
set -e

PORT=8001  # choose a free port

echo "Killing any process on port $PORT..."
lsof -ti :$PORT | xargs -r kill -9 || true

echo "Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Starting Django server in background..."
cd isd
python3 manage.py runserver 0.0.0.0:$PORT &
PID=$!

# Wait a few seconds for server to start
sleep 5

# Test if server is running
if lsof -i :$PORT > /dev/null; then
    echo "Backend started successfully!"
else
    echo "Backend failed to start"
    # Try to kill process if it exists
    if ps -p $PID > /dev/null; then
        kill $PID
    fi
    exit 1
fi

# Kill the background process
if ps -p $PID > /dev/null; then
    kill $PID
    wait $PID 2>/dev/null || true
fi

echo "Backend test completed."
