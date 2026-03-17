
import sys
import os
sys.path.append(os.getcwd())
from tools.search_tools import get_weather

locations = ["Hyderabad", "New York", "London", "Tokyo"]
for loc in locations:
    print(f"Testing weather for {loc}:")
    print(get_weather(loc))
    print("-" * 20)
