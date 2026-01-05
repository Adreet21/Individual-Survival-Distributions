#!/bin/bash
set -e

echo "Navigating to frontend..."
cd frontend

echo "Installing dependencies..."
npm install

echo "Starting frontend server in background..."
npm run dev &
PID=$!

# Wait a few seconds for server to start
sleep 5

# Check if the process is still alive
if ps -p $PID > /dev/null; then
    echo "Frontend server started successfully!"
else
    echo "Frontend failed to start"
    exit 1
fi

# Kill the background process
kill $PID
wait $PID 2>/dev/null || true
echo "Frontend test completed."
