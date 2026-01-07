#!/bin/bash
echo "==================================================="
echo "  TASKFLOW - PUBLIC ACCESS SETUP"
echo "==================================================="
echo ""
echo "1. Starting Backend Server..."
# Run in background
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
SERVER_PID=$!
echo "   Server running on localhost:8000 (PID: $SERVER_PID)"
echo ""
echo "2. To put this online, you need NGROK installed."
echo "   If you have ngrok, open a NEW terminal window and type:"
echo ""
echo "   ngrok http 8000"
echo ""
echo "   Then copy the https://....ngrok-free.app URL and share it."
echo "   It will automatically detect mobile vs desktop."
echo ""
echo "Press [ENTER] to stop the server..."
read
kill $SERVER_PID
