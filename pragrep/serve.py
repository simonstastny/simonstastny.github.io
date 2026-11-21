#!/usr/bin/env python3
"""Static file server for the map that stops browsers from using stale copies
of app.js / style.css / data after you edit them.

Usage:  python3 serve.py [port]     (default port 8765)
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Browser may keep a copy but must revalidate it (cheap 304 if unchanged).
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=str(Path(__file__).resolve().parent))
    print(f"Serving on http://localhost:{port}")
    ThreadingHTTPServer(("", port), handler).serve_forever()
