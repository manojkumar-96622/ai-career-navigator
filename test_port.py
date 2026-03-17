import socket
s = socket.socket(socket.getaddrinfo('127.0.0.1', 8080)[0][0], socket.SOCK_STREAM)
try:
    s.bind(('127.0.0.1', 8080))
    print("Port 8080 is FREE")
except socket.error as e:
    print(f"Port 8080 is BUSY: {e}")
finally:
    s.close()
