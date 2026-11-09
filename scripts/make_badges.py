#!/usr/bin/env python3
"""Write printable player badges to badges/: one SVG per colour x shape and badges/print.html to pick and print them.

Each badge is a pure-colour shape with a thick black outline on a white card with a black border, so a camera can tell it
apart from clothing. Print at 100 % (no "fit to page") on matte paper; each badge is 18 cm square.
"""
from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "badges"
COLOURS = {"red": "#e60000", "green": "#00a63c", "blue": "#0050ff", "yellow": "#ffb800", "magenta": "#e6008a"}
C = 90  # centre of the 180 x 180 card


# Fun shapes: bold single silhouettes (fine detail does not survive at a distance). `body` is drawn outlined then filled;
# `detail` is drawn on top (eyes, body line) in white or black.
FUN = {
    "heart": ('<path d="M90 150 C 20 105, 28 38, 65 38 C 80 38, 90 50, 90 62 C 90 50, 100 38, 115 38 C 152 38, 160 105, 90 150 Z"/>', ""),
    "fish": ('<ellipse cx="78" cy="90" rx="54" ry="36"/><polygon points="122,90 168,56 168,124"/>',
             '<circle cx="52" cy="80" r="7" fill="#fff"/><circle cx="50" cy="80" r="3" fill="#000"/>'),
    "butterfly": ('<ellipse cx="60" cy="68" rx="36" ry="27" transform="rotate(-28 60 68)"/><ellipse cx="120" cy="68" rx="36" ry="27" transform="rotate(28 120 68)"/>'
                  '<ellipse cx="68" cy="116" rx="26" ry="21" transform="rotate(28 68 116)"/><ellipse cx="112" cy="116" rx="26" ry="21" transform="rotate(-28 112 116)"/>',
                  '<ellipse cx="90" cy="92" rx="6" ry="42" fill="#000"/>'),
    "cat": ('<circle cx="90" cy="102" r="48"/><polygon points="44,84 48,28 84,58"/><polygon points="136,84 132,28 96,58"/>',
            '<circle cx="72" cy="98" r="7" fill="#fff"/><circle cx="108" cy="98" r="7" fill="#fff"/><circle cx="72" cy="98" r="3" fill="#000"/><circle cx="108" cy="98" r="3" fill="#000"/>'
            '<polygon points="84,116 96,116 90,124" fill="#000"/>'),
    "rabbit": ('<ellipse cx="66" cy="52" rx="14" ry="42" transform="rotate(-9 66 52)"/><ellipse cx="114" cy="52" rx="14" ry="42" transform="rotate(9 114 52)"/><circle cx="90" cy="118" r="40"/>',
               '<ellipse cx="66" cy="54" rx="6" ry="28" transform="rotate(-9 66 54)" fill="#fff"/><ellipse cx="114" cy="54" rx="6" ry="28" transform="rotate(9 114 54)" fill="#fff"/>'
               '<circle cx="74" cy="112" r="6" fill="#000"/><circle cx="106" cy="112" r="6" fill="#000"/><polygon points="83,128 97,128 90,137" fill="#000"/>'),
    "elephant": ('<circle cx="38" cy="86" r="32"/><circle cx="142" cy="86" r="32"/><circle cx="90" cy="84" r="40"/><rect x="78" y="100" width="24" height="54" rx="12"/><ellipse cx="92" cy="154" rx="17" ry="11"/>',
                 '<circle cx="74" cy="76" r="6" fill="#000"/><circle cx="106" cy="76" r="6" fill="#000"/>'
                 '<path d="M62 108 Q58 128 70 132" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M118 108 Q122 128 110 132" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>'),
    "kangaroo": ('<ellipse cx="82" cy="100" rx="30" ry="42" transform="rotate(14 82 100)"/><ellipse cx="104" cy="52" rx="20" ry="13" transform="rotate(25 104 52)"/><polygon points="112,50 134,62 124,70 104,62"/>'
                 '<ellipse cx="94" cy="28" rx="5" ry="16" transform="rotate(-12 94 28)"/><ellipse cx="108" cy="30" rx="5" ry="15" transform="rotate(8 108 30)"/>'
                 '<ellipse cx="90" cy="76" rx="14" ry="20" transform="rotate(10 90 76)"/>'
                 '<path d="M58 118 Q30 146 10 168 Q42 172 72 148 Z"/><ellipse cx="88" cy="138" rx="15" ry="26" transform="rotate(25 88 138)"/><polygon points="92,150 128,160 128,171 84,171"/>'
                 '<ellipse cx="108" cy="88" rx="6" ry="14" transform="rotate(-30 108 88)"/>',
                 '<circle cx="106" cy="50" r="3.5" fill="#fff"/>'),
    "moon": ('<path d="M112 26 A64 64 0 1 0 156 120 A50 50 0 0 1 112 26 Z"/>', ""),
    "flower": (''.join(f'<circle cx="{90 + 38 * math.sin(math.radians(a)):.1f}" cy="{90 - 38 * math.cos(math.radians(a)):.1f}" r="26"/>' for a in range(0, 360, 72)) + '<circle cx="90" cy="90" r="20"/>',
               '<circle cx="90" cy="90" r="15" fill="#fff"/>'),
}


def shape_path(name: str) -> str:
    if name in FUN:
        return ""  # drawn by badge_svg
    if name == "circle":
        return f'<circle cx="{C}" cy="{C}" r="56"/>'
    if name == "square":
        return f'<rect x="{C - 52}" y="{C - 52}" width="104" height="104"/>'
    if name == "triangle":
        pts = [(C, C - 62), (C + 62, C + 46), (C - 62, C + 46)]
    elif name == "star":
        pts = [(C + (62 if i % 2 == 0 else 26) * math.sin(math.pi * i / 5), C - (62 if i % 2 == 0 else 26) * math.cos(math.pi * i / 5)) for i in range(10)]
    else:
        raise ValueError(name)
    return '<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + '"/>'


def badge_svg(colour: str, shape: str) -> str:
    if shape in FUN:
        body, detail = FUN[shape]
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180mm" height="180mm">'
                f'<rect width="180" height="180" fill="#fff"/><rect x="3" y="3" width="174" height="174" fill="none" stroke="#000" stroke-width="6"/>'
                f'<g fill="#000" stroke="#000" stroke-width="10" stroke-linejoin="round">{body}</g>'
                f'<g fill="{COLOURS[colour]}">{body}</g>{detail}</svg>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180mm" height="180mm">'
            f'<rect width="180" height="180" fill="#fff"/><rect x="3" y="3" width="174" height="174" fill="none" stroke="#000" stroke-width="6"/>'
            f'<g fill="{COLOURS[colour]}" stroke="#000" stroke-width="5" stroke-linejoin="round">{shape_path(shape)}</g></svg>')


def main() -> None:
    OUT.mkdir(exist_ok=True)
    shapes = ["circle", "triangle", "square", "star", *FUN]
    cards = []
    for colour in COLOURS:
        for shape in shapes:
            svg = badge_svg(colour, shape)
            (OUT / f"{colour}-{shape}.svg").write_text(svg)
            cards.append((colour, shape, svg))
    html = ["<!doctype html><meta charset=utf-8><title>Player badges</title><style>",
            "body{font:16px system-ui;margin:20px} .ctl{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ccc;z-index:2}",
            ".grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px} label.c{display:block;width:150px;text-align:center;cursor:pointer}",
            ".c svg{width:140px;height:140px;border:1px solid #ccc} .page{display:none}",
            "@media print{.ctl,.grid{display:none} .page.on{display:block;page-break-after:always;width:180mm;height:180mm;margin:0 auto} .page svg{width:180mm;height:180mm} body{margin:10mm}}",
            "</style><div class=ctl><b>Pick the badges to print</b> (one colour + shape per person; two copies each, front and back). ",
            "<button onclick=\"print()\">Print selected</button> <small>Print at 100 % scale on matte paper, no 'fit to page'. Each badge is 18 cm.</small></div><div class=grid>"]
    for i, (colour, shape, svg) in enumerate(cards):
        thumb = svg.replace(' width="180mm" height="180mm"', "")
        html.append(f'<label class=c><input type=checkbox data-i={i} onchange="sync()"> {colour} {shape}{thumb}</label>')
    html.append("</div>")
    for i, (_, _, svg) in enumerate(cards):
        html.append(f'<div class=page id=p{i}>{svg}</div><div class=page id=q{i}>{svg}</div>')  # two copies: front and back
    html.append("<script>function sync(){document.querySelectorAll('input[data-i]').forEach(b=>{for(const p of ['p','q'])document.getElementById(p+b.dataset.i).classList.toggle('on',b.checked)})}</script>")
    (OUT / "print.html").write_text("\n".join(html))
    print(f"Wrote {len(cards)} badges and print.html to {OUT}")


if __name__ == "__main__":
    main()
