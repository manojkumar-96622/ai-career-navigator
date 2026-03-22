import codecs
import json

try:
    with codecs.open("debug2.log", "r", "utf-16le") as f:
        log = f.read()
        
    for line in log.split("\n"):
        if '"type": "text"' in line:
            print(f"FOUND TEXT EVENT: {line[:200]}")
            
except Exception as e:
    print(f"Error reading file: {e}")
