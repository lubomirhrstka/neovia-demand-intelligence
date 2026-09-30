#!/usr/bin/env python3
"""Generuje src/app/theme-gamrot.css z globals.css.
Tmavé téma inspirované danielgamrot.cz: černá, grafit, oranžový akcent.
Spuštění: python3 scripts/generate-theme-gamrot.py
"""
import colorsys, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/app/globals.css"
OUT = ROOT / "src/app/theme-gamrot.css"
PREFIX = ':root[data-theme="gamrot"]'

HEX = re.compile(r"#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b")
RGBA = re.compile(r"rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)")

ACCENT = (0xF0, 0x6A, 0x15)
ACCENT_DARK = (0xC0, 0x55, 0x10)


def lerp_l(l):
    pts = [(0, .97), (.3, .92), (.45, .78), (.55, .66), (.7, .42), (.8, .19), (.88, .13), (.94, .08), (1, .04)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= l <= x1:
            return y0 + (y1 - y0) * (l - x0) / (x1 - x0)
    return l


def map_rgb(r, g, b, prop, keep=False):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hue = h * 360
    teal = 140 <= hue <= 210
    accent = teal and s > .35 and .18 < l < .75
    if prop == "shadow":
        return ACCENT if accent else (0, 0, 0)   # akcentní linky oranžově, stíny černě
    if keep:
        # prvky, které už v původním tématu byly tmavé (levý panel) – světlost nechat,
        # jen převést do neutrální grafitové + oranžový akcent
        if accent:
            return ACCENT_DARK if (prop != "color" and l < .34) else ACCENT
        nl = l * .45 if l < .3 else l
        r2, g2, b2 = colorsys.hls_to_rgb(h, nl, min(s, .05) if teal else s * .5)
        return tuple(round(v * 255) for v in (r2, g2, b2))
    # výrazný teal/zelený akcent -> oranžová
    if teal and s > .35 and .18 < l < .62:
        return ACCENT_DARK if (prop != "color" and l < .34) else ACCENT
    # bílý text (na akcentových tlačítkách) zůstává bílý
    if prop == "color" and l > .9:
        return (255, 255, 255)
    nl = lerp_l(l)
    if prop == "border" and l > .6:
        nl = max(nl, .13)         # rámečky ve stylu #1f1f1f, ať nezmizí
    if teal:
        ns = min(s, .06)          # neutrální grafit místo mentolových odstínů
    elif s > .25:
        ns = s * .75              # stavové barvy (červená, žlutá) zachovat, ztlumit
        if prop == "color":
            nl = max(nl, .62)
    else:
        ns = s * .3
    r2, g2, b2 = colorsys.hls_to_rgb(h, nl, ns)
    return tuple(round(v * 255) for v in (r2, g2, b2))


def to_hex(rgb, alpha=""):
    return "#" + "".join(f"{v:02x}" for v in rgb) + alpha


def convert_value(value, prop, keep=False):
    def hex_sub(m):
        x = m.group(1)
        if len(x) in (3, 4):
            x = "".join(c * 2 for c in x)
        rgb = tuple(int(x[i:i + 2], 16) for i in (0, 2, 4))
        return to_hex(map_rgb(*rgb, prop, keep), x[6:8] if len(x) == 8 else "")

    def rgba_sub(m):
        rgb = map_rgb(int(m.group(1)), int(m.group(2)), int(m.group(3)), prop, keep)
        a = m.group(4)
        return f"rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, {a})" if a else f"rgb({rgb[0]}, {rgb[1]}, {rgb[2]})"

    value = HEX.sub(hex_sub, value)
    value = RGBA.sub(rgba_sub, value)
    value = re.sub(r"\bwhite\b", "#fff" if prop == "color" else "#0a0a0a", value)
    return value


def prefix_selector(sel):
    parts = []
    for s in sel.split(","):
        s = s.strip()
        if not s:
            continue
        if s in (":root", "html"):
            parts.append(PREFIX)
        elif s.startswith("html "):
            parts.append(f"{PREFIX} {s[5:]}")
        else:
            parts.append(f"{PREFIX} {s}")
    return ", ".join(parts)


TEXT_VARS = {"--ink", "--muted"}


# Selektory prvků, které jsou už v původním tématu tmavé (levý panel)
DARK_CONTEXT = re.compile(r"\.(sidebar|brand|workspace|nav|bottom|toast|modal-backdrop|ink|dark|legend)(?![\w-])")


def convert_block(body, keep=False):
    out = []
    for decl in re.split(r";(?![^(]*\))", body):
        if ":" not in decl:
            continue
        prop, val = decl.split(":", 1)
        prop = prop.strip()
        if not (HEX.search(val) or RGBA.search(val) or re.search(r"\bwhite\b", val)):
            continue
        if prop.startswith("--"):
            kind = "color" if prop in TEXT_VARS else "background"
        elif prop in ("color", "fill", "caret-color") or prop.endswith("-color") and prop.startswith("text"):
            kind = "color"
        elif "shadow" in prop:
            kind = "shadow"
        elif prop.startswith("border") or prop.startswith("outline"):
            kind = "border"
        else:
            kind = "background"
        out.append(f"{prop}:{convert_value(val.strip(), kind, keep)}")
    return ";".join(out)


def parse(css, depth=0):
    """Vrátí seznam převedených pravidel ze (zjednodušeně) parsovaného CSS."""
    res, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j == -1:
            break
        head = css[i:j].strip()
        # najdi párovou závorku
        k, lvl = j + 1, 1
        while k < n and lvl:
            if css[k] == "{":
                lvl += 1
            elif css[k] == "}":
                lvl -= 1
            k += 1
        inner = css[j + 1:k - 1]
        # odstraň případné @import / komentáře v hlavičce
        head = re.sub(r"/\*.*?\*/", "", head, flags=re.S)
        head = re.sub(r"@import[^;]*;", "", head).strip()
        if head.startswith("@media") or head.startswith("@supports") or head.startswith("@layer"):
            sub = parse(inner, depth + 1)
            if sub:
                res.append(f"{head}{{{''.join(sub)}}}")
        elif head.startswith("@"):
            pass  # keyframes, font-face, property ...
        else:
            body = convert_block(inner, bool(DARK_CONTEXT.search(head)))
            if body:
                res.append(f"{prefix_selector(head)}{{{body}}}\n")
        i = k
    return res


INLINE = re.compile(r"(color|background|borderColor|border)\s*:\s*\"(#[0-9a-fA-F]{3,8})\"")


def inline_overrides():
    rules, seen = [], set()
    for f in list((ROOT / "src").rglob("*.tsx")):
        for prop, val in INLINE.findall(f.read_text(encoding="utf-8")):
            css_prop = {"borderColor": "border-color"}.get(prop, prop)
            key = (css_prop, val.lower())
            if key in seen:
                continue
            seen.add(key)
            kind = "color" if css_prop == "color" else "background"
            new = convert_value(val, kind)
            rules.append(f'{PREFIX} [style*="{css_prop}: {val}"]{{{css_prop}:{new} !important}}\n')
    return rules


BASE = f"""/* AUTOMATICKY GENEROVÁNO scripts/generate-theme-gamrot.py – neupravovat ručně */
/* Téma „Gamrot" – inspirováno danielgamrot.cz (černá, grafit, oranžový akcent #f06a15) */
{PREFIX}{{color-scheme:dark;--accent:#f06a15;--accent-btn:#c05510;--accent-hover:#d45500}}
{PREFIX} body{{background:#000;color:#fff}}
{PREFIX} input,{PREFIX} select,{PREFIX} textarea{{background:#0a0a0a;color:#fff;border-color:#1f1f1f}}
{PREFIX} input::placeholder,{PREFIX} textarea::placeholder{{color:#808080}}
{PREFIX} ::selection{{background:#f06a1555}}
{PREFIX} button.primary:hover{{background:#d45500}}
"""

if __name__ == "__main__":
    css = SRC.read_text(encoding="utf-8")
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"@import\s+(url\([^)]*\)|\"[^\"]*\"|'[^']*')[^;]*;", "", css)
    rules = parse(css)
    OUT.write_text(BASE + "".join(rules) + "".join(inline_overrides()), encoding="utf-8")
    print(f"OK: {len(rules)} pravidel -> {OUT.relative_to(ROOT)}")
