import requests
import time
import os
import subprocess
import signal
import shutil

# Start server
server = subprocess.Popen(["uvicorn", "backend.main:app", "--port", "8003", "--host", "0.0.0.0"], cwd=os.getcwd())
time.sleep(5) # Wait for server to start

try:
    url = "http://localhost:8003/chat/upload"

    # Test valid file (txt)
    with open('test_ok.txt', 'w') as f: f.write('content')
    files = {'files': ('test_ok.txt', open('test_ok.txt', 'rb'), 'text/plain')}
    response = requests.post(url, files=files)
    print(f"Test Allowed (txt): {response.status_code} - len: {len(response.json())}")
    if len(response.json()) == 0: print("FAIL: txt should be allowed")

    # Test previously allowed file (png)
    with open('test_ok.png', 'w') as f: f.write('content')
    files = {'files': ('test_ok.png', open('test_ok.png', 'rb'), 'image/png')}
    response = requests.post(url, files=files)
    print(f"Test Allowed (png): {response.status_code} - len: {len(response.json())}")

    # Test random extension (should be allowed now)
    with open('test.xyz', 'w') as f: f.write('content')
    files = {'files': ('test.xyz', open('test.xyz', 'rb'), 'application/octet-stream')}
    response = requests.post(url, files=files)
    print(f"Test Allowed (xyz): {response.status_code} - len: {len(response.json())}")

    # Test Blocked (exe)
    with open('test_bad.exe', 'w') as f: f.write('content')
    files = {'files': ('test_bad.exe', open('test_bad.exe', 'rb'), 'application/octet-stream')}
    response = requests.post(url, files=files)
    print(f"Test Blocked (exe): {response.status_code} - len: {len(response.json())}")
    if len(response.json()) > 0: print("FAIL: exe should be blocked")

finally:
    server.send_signal(signal.SIGINT)
    server.wait()
    if os.path.exists('test_ok.txt'): os.remove('test_ok.txt')
    if os.path.exists('test_ok.png'): os.remove('test_ok.png')
    if os.path.exists('test.xyz'): os.remove('test.xyz')
    if os.path.exists('test_bad.exe'): os.remove('test_bad.exe')
