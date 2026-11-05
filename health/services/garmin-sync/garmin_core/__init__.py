"""Garmin access layer copied from open-vitals services/garmin/app (garmy + curl_cffi).

Kept close to upstream on purpose: fixes there can be ported file by file.
The HTTP layer (FastAPI main.py) is not used here; sync/ calls these classes directly.
"""
