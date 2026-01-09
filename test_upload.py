import requests
import time
import os
import subprocess
import signal

# Start server
server = subprocess.Popen(["uvicorn", "backend.main:app", "--port", "8002", "--host", "0.0.0.0"], cwd=os.getcwd())
time.sleep(5) # Wait for server to start

try:
    url = "http://localhost:8002/chat/upload"

    # Test valid file
    files = {'files': ('test.txt', open('test.txt', 'rb'), 'text/plain')}
    response = requests.post(url, files=files)
    print(f"Test TXT: {response.status_code} - {response.text}")

    # Test PNG
    files = {'files': ('test.png', open('test.png', 'rb'), 'image/png')}
    response = requests.post(url, files=files)
    print(f"Test PNG: {response.status_code} - {response.text}")

    # Test Invalid
    files = {'files': ('test.exe', open('test.txt', 'rb'), 'application/octet-stream')}
    response = requests.post(url, files=files)
    print(f"Test EXE: {response.status_code} - {response.text}")

finally:
    server.send_signal(signal.SIGINT)
    server.wait()
