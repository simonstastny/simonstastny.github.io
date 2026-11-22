#!/usr/bin/env python3
"""Local server for Praggle. It serves the whole site (the parent folder),
because the street map comes from ../pragrep/data/streets.geojson, and tells
browsers not to use stale copies of edited files.

Usage:  python3 serve.py [port]     (default port 8767), then open
        http://localhost:8767/praggle/
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    handler = partial(NoCacheHandler, directory=str(Path(__file__).resolve().parent.parent))
    print(f"Serving on http://localhost:{port}/praggle/")
    ThreadingHTTPServer(("", port), handler).serve_forever()
