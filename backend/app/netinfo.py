"""LAN address discovery and display listing (no network traffic is generated)."""
from __future__ import annotations

import re
import socket
import subprocess


def lan_ips() -> list[str]:
    ips: list[str] = []
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=2).stdout.split()
        ips = [i for i in out if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", i)]
    except Exception:
        pass
    if not ips:
        try:
            ips = [i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
        except OSError:
            ips = []

    def rank(ip: str) -> int:  # prefer typical home Wi-Fi ranges over docker/VPN bridges
        if ip.startswith("192.168."):
            return 0
        if ip.startswith("10."):
            return 1
        if ip.startswith("172.17.") or ip.startswith("172.18.") or ip.startswith("169.254."):
            return 3
        return 2

    return sorted({i for i in ips if not i.startswith("127.")}, key=rank)


def displays() -> list[dict]:
    """Parse `xrandr --query`. Returns [] when unavailable (e.g. pure Wayland)."""
    try:
        out = subprocess.run(["xrandr", "--query"], capture_output=True, text=True, timeout=3).stdout
    except Exception:
        return []
    res = []
    for m in re.finditer(r"^(\S+) connected( primary)? (\d+)x(\d+)\+(\d+)\+(\d+)", out, re.M):
        res.append({"name": m[1], "primary": bool(m[2]), "width": int(m[3]), "height": int(m[4]),
                    "x": int(m[5]), "y": int(m[6])})
    return res
