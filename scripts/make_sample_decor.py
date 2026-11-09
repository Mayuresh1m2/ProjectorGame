#!/usr/bin/env python3
"""Write four original Diwali decoration pictures (SVG) to media/decor/ so the multi-surface layouts can be tried
without any pictures of your own. Pure Python, no dependencies. Replace them with your own art any time."""
import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parents[1] / "media" / "decor"
W, H = 800, 600


def svg(body: str, bg1="#14082e", bg2="#3a0f2c") -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff8c1a" stop-opacity="0"/></radialGradient>
<radialGradient id="flame" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffb832"/><stop offset="1" stop-color="#ff5a1f"/></radialGradient>
<linearGradient id="clay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9742b"/><stop offset="1" stop-color="#7a2e10"/></linearGradient>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
{body}
</svg>
"""


def stars(n=40, seed=3):
    out, s = [], seed
    for _ in range(n):
        s = (s * 1103515245 + 12345) % 2**31
        x = s % W
        s = (s * 1103515245 + 12345) % 2**31
        y = s % int(H * 0.8)
        out.append(f'<circle cx="{x}" cy="{y}" r="{1 + (x + y) % 3 * 0.6:.1f}" fill="#fff" opacity="{0.25 + (x * y) % 50 / 100:.2f}"/>')
    return "".join(out)


def diya():
    return svg(stars() + """
<circle cx="400" cy="300" r="260" fill="url(#glow)"/>
<path d="M 400 120 C 340 210 350 280 400 320 C 450 280 460 210 400 120 Z" fill="url(#flame)"/>
<path d="M 400 215 C 380 255 385 285 400 300 C 415 285 420 255 400 215 Z" fill="#fff8dc" opacity=".9"/>
<path d="M 170 340 Q 400 300 630 340 Q 600 500 400 520 Q 200 500 170 340 Z" fill="url(#clay)"/>
<ellipse cx="400" cy="340" rx="230" ry="38" fill="#a23d12"/>
<ellipse cx="400" cy="338" rx="205" ry="28" fill="#3a1408"/>
<path d="M 300 440 Q 400 470 500 440" stroke="#ffd27a" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="2 14"/>
<ellipse cx="400" cy="548" rx="170" ry="16" fill="#000" opacity=".35"/>""")


def lantern():
    pts = []
    for i in range(16):  # 8-pointed star
        r = 210 if i % 2 == 0 else 105
        a = math.pi * 2 * i / 16 - math.pi / 2
        pts.append(f"{400 + r * math.cos(a):.1f},{300 + r * math.sin(a):.1f}")
    inner = []
    for i in range(16):
        r = 150 if i % 2 == 0 else 75
        a = math.pi * 2 * i / 16 - math.pi / 2
        inner.append(f"{400 + r * math.cos(a):.1f},{300 + r * math.sin(a):.1f}")
    return svg(stars(30, 9) + f"""
<line x1="400" y1="0" x2="400" y2="95" stroke="#ffd27a" stroke-width="4"/>
<circle cx="400" cy="300" r="290" fill="url(#glow)"/>
<polygon points="{' '.join(pts)}" fill="#c8102e" stroke="#ffd27a" stroke-width="6" stroke-linejoin="round"/>
<polygon points="{' '.join(inner)}" fill="#ff8c1a" stroke="#ffd27a" stroke-width="3" stroke-linejoin="round"/>
<circle cx="400" cy="300" r="46" fill="url(#flame)"/>
<path d="M 400 510 L 400 545" stroke="#ffd27a" stroke-width="5"/>
<path d="M 380 545 L 420 545 L 410 590 L 390 590 Z" fill="#ffd27a"/>""", "#0d0626", "#2b0a30")


def rangoli():
    parts = [f'<circle cx="400" cy="300" r="285" fill="url(#glow)" opacity=".5"/>']
    palette = ["#ff4d6d", "#ffb703", "#fb5607", "#8338ec", "#3a86ff", "#06d6a0"]
    for ring, (r, n, size, col) in enumerate([(235, 16, 34, 0), (190, 16, 30, 1), (140, 12, 38, 2), (92, 8, 34, 3), (46, 8, 22, 4)]):
        for k in range(n):
            a = 2 * math.pi * k / n + (math.pi / n if ring % 2 else 0)
            x, y = 400 + r * math.cos(a), 300 + r * math.sin(a)
            deg = math.degrees(a)
            parts.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{size * 0.55:.1f}" ry="{size:.1f}" transform="rotate({deg + 90:.1f} {x:.1f} {y:.1f})" fill="{palette[(col + k) % len(palette)]}" opacity=".95"/>')
            parts.append(f'<circle cx="{400 + (r + size * 0.9) * math.cos(a):.1f}" cy="{300 + (r + size * 0.9) * math.sin(a):.1f}" r="4" fill="#fff6c8"/>')
    parts.append('<circle cx="400" cy="300" r="22" fill="#fff6c8"/><circle cx="400" cy="300" r="12" fill="#ff8c1a"/>')
    return svg("".join(parts), "#12062a", "#2a0b3a")


def marigold():
    parts = [stars(25, 5)]
    for y0, amp in ((90, 70), (250, 90), (430, 70)):  # three swags of marigold garland
        for k in range(26):
            t = k / 25
            x = 30 + 740 * t
            y = y0 + amp * math.sin(math.pi * t) * 1.0
            col = ["#ff8c1a", "#ffb703", "#ff5a1f"][k % 3]
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="22" fill="{col}"/><circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="#ffe08a" opacity=".85"/>')
        for k in (6, 13, 20):  # leaves hanging from the swag
            t = k / 25
            x = 30 + 740 * t
            y = y0 + amp * math.sin(math.pi * t) + 22
            parts.append(f'<path d="M {x:.1f} {y:.1f} q 14 26 0 52 q -14 -26 0 -52 Z" fill="#2f9e44"/>')
    return svg("".join(parts), "#0d0626", "#2b0a1f")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("diya", diya), ("lantern", lantern), ("rangoli", rangoli), ("marigold", marigold)):
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("wrote", OUT / f"{name}.svg")


if __name__ == "__main__":
    main()
