#!/usr/bin/env python3
"""Contrast checks for the M5 palette. Usage: python3 contrast.py round2/source/r2/margin.css

Prints the label and text-pair tables used in label-palette.md (source token names: lb1, text-3...).
"""
import re, math, sys
css = open(sys.argv[1]).read()
def block(name):
    m = re.search(r'^\.' + name + r' \{(.*?)^\}', css, re.S | re.M)
    return dict(re.findall(r'--([\w-]+):\s*([^;]+);', m.group(1)))
def oklch(s):
    m = re.match(r'oklch\(([\d.]+) ([\d.]+) ([\d.]+)', s.strip())
    return tuple(float(x) for x in m.groups()) if m else None
def to_rgb(L, C, H):
    h = math.radians(H); a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    return [min(1, max(0, c)) for c in (r, g, bb)]  # linear
def lum(v): r, g, b = to_rgb(*v); return 0.2126*r + 0.7152*g + 0.0722*b
def ratio(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True); return (x + 0.05) / (y + 0.05)
def hexc(v):
    def enc(c): return 12.92*c if c <= 0.0031308 else 1.055*c**(1/2.4) - 0.055
    return '#' + ''.join('%02x' % round(enc(c)*255) for c in to_rgb(*v))
out = []
for theme in ('light', 'dark'):
    t = block(theme); g = lambda k: oklch(t[k])
    out.append(f'\n### {theme}\n')
    out.append('| Label | OKLCH | Hex | vs bg | vs surface | vs chip bg (bg-grp) |\n|---|---|---|---|---|---|')
    for i in range(1, 10):
        v = g(f'lb{i}')
        out.append(f'| lb{i} | `{t[f"lb{i}"]}` | `{hexc(v)}` | {ratio(v, g("bg")):.2f} | {ratio(v, g("surface")):.2f} | {ratio(v, g("bg-grp")):.2f} |')
    out.append('\n| Text pair | Ratio | AA |\n|---|---|---|')
    pairs = [('text', 'bg'), ('text', 'surface'), ('text-2', 'bg'), ('text-2', 'surface'), ('text-3', 'bg'), ('text-3', 'surface'), ('text-3', 'bg-lane'),
             ('accent-text', 'bg'), ('accent-ink', 'accent'), ('danger', 'bg'), ('danger', 'danger-soft'), ('ok', 'ok-soft'), ('accent-text', 'accent-soft'), ('tile-ink', 'lb1'), ('tile-ink', 'lb2'), ('tile-ink', 'lb3'), ('tile-ink', 'lb4'), ('tile-ink', 'lb5'), ('tile-ink', 'lb6'), ('text-3', 'bg-grp'), ('text-2', 'bg-lane'), ('text-2', 'kbd-bg')]
    for a, b in pairs:
        r = ratio(g(a), g(b)); out.append(f'| `{a}` on `{b}` | {r:.2f} | {"pass" if r >= 4.5 else "large text only" if r >= 3 else "FAIL"} |')
print('\n'.join(out))
