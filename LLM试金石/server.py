#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
LLM 试金石 — 本地服务器
在桌面文件夹中启动，提供前端页面。
"""

import http.server
import os
import socket
import webbrowser

PORT = 15432
DIR = os.path.dirname(os.path.abspath(__file__))


def find_free_port(start: int) -> int:
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass  # quiet


def main():
    port = find_free_port(PORT)
    server = http.server.HTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/index.html"
    print(f"\n  ✦ LLM 试金石 已启动 ✦\n")
    print(f"  ─→ {url}")
    webbrowser.open(url, new=2)
    print(f"\n  关闭此窗口以停止服务器\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
