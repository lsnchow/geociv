import os
from dotenv import load_dotenv
load_dotenv()

val = os.getenv("DATABASE_URL")

print("DATABASE_URL set?", val is not None, "length:", 0 if val is None else len(val))
print("DATABASE_URL repr:", repr(val))