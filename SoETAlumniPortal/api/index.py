import os
import sys
from pathlib import Path

# Ensure api directory is in Python path for Vercel serverless execution
api_dir = Path(__file__).resolve().parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from main import app
