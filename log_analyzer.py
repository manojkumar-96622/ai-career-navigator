import os

log_files = ['uvicorn_final.txt', 'server_error.log', 'uvicorn_direct.txt']

for log_file in log_files:
    if os.path.exists(log_file):
        print(f"--- Analyzing {log_file} ---")
        try:
            with open(log_file, 'r', encoding='utf-16le', errors='ignore') as f:
                lines = f.readlines()
            
            # Print last few tracebacks
            traceback_buffer = []
            in_traceback = False
            for line in lines:
                if 'Traceback' in line:
                    in_traceback = True
                
                if in_traceback:
                    traceback_buffer.append(line)
                    if not line.startswith(' ') and 'Traceback' not in line and len(traceback_buffer) > 1:
                        # End of a traceback block (heuristic)
                        if any(x in ''.join(traceback_buffer) for x in ['Error', 'Exception']):
                            print(''.join(traceback_buffer[-20:])) # print end of it
                        traceback_buffer = []
                        in_traceback = False
            
            # Also just check the very last 50 lines for any ERROR
            print(f"\nFinal lines of {log_file}:")
            for line in lines[-50:]:
                if 'ERROR' in line or 'Exception' in line or 'Error' in line:
                    print(line.strip())
        except Exception as e:
            print(f"Could not read {log_file}: {e}")
    else:
        print(f"Log file {log_file} not found.")
