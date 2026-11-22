#!/usr/bin/env python3
"""Static file server for local development.

- Stops browsers from using stale copies of app.js / style.css / data after
  you edit them (Cache-Control: no-cache).
- Answers HTTP range requests ("Range: bytes=a-b"), which the map needs to
  read pieces of data/cz.pmtiles. GitHub Pages does this too; Python's
  built-in server does not.

Usage:  python3 serve.py [port]     (default port 8766)
"""

import os
import re
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Browser may keep a copy but must revalidate it (cheap 304 if unchanged).
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self._remaining = None
        m = RANGE.match(self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        if a == "":  # suffix range: the last N bytes
            start, end = max(size - int(b or 0), 0), size - 1
        else:
            start, end = int(a), min(int(b) if b else size - 1, size - 1)
        if start > end or start >= size:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = self._remaining
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    handler = partial(Handler, directory=str(Path(__file__).resolve().parent))
    print(f"Serving on http://localhost:{port}")
    ThreadingHTTPServer(("", port), handler).serve_forever()
