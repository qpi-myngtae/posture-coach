from __future__ import annotations

import os
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = "127.0.0.1"
PORT = 8765


def main() -> None:
    root = Path(__file__).resolve().parent
    os.chdir(root)
    url = f"http://{HOST}:{PORT}/"
    print(f"Serving Posture Coach at {url}")
    print("Press Ctrl+C to stop.")
    webbrowser.open(url)
    ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler).serve_forever()


if __name__ == "__main__":
    main()
