import os
import subprocess
import socket
import time

def kill_port(port):
    try:
        from subprocess import check_output
        result = check_output(["netstat", "-ano", "-p", "tcp"])
        for line in result.decode().splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                print(f"Killing PID {pid} on port {port}")
                os.system(f"taskkill /F /PID {pid}")
    except Exception as e:
        print(f"Error killing port: {e}")

kill_port(8080)
time.sleep(1)
print("Starting backend...")
subprocess.Popen(["venv\\Scripts\\python", "-m", "uvicorn", "app_backend:app", "--host", "127.0.0.1", "--port", "8080"], shell=True)
print("Done.")
