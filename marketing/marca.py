"""Elementos de marca compartidos por las piezas de marketing (instagram/ y video/).

La fuente Geist y los íconos de lucide salen de frontend/node_modules (hacer `npm install`
en frontend/ antes de generar)."""
import pathlib, re

ROOT = pathlib.Path(__file__).parent
FRONT = ROOT.parent / "frontend"
FONT = (FRONT / "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2").as_uri()
LUCIDE = FRONT / "node_modules/lucide-react/dist/esm/icons"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

HANDLE = "@medilu.app"
WHATSAPP = "261 593-0274"
DIAS_PRUEBA = 14

# Tokens de color de la app (frontend/src/index.css)
TOKENS = """
  --bg: oklch(0.994 0.003 240); --fg: oklch(0.23 0.03 255); --muted: oklch(0.45 0.03 252);
  --primary: oklch(0.48 0.14 256); --on-primary: oklch(0.985 0.005 240);
  --accent: oklch(0.945 0.028 240); --turno: oklch(0.643 0.111 192); --turno-on: oklch(0.781 0.121 190);
  --border: oklch(0.905 0.012 245); --card: #fff; --wa: oklch(0.63 0.17 150);
"""
FONT_FACE = f"@font-face {{ font-family: Geist; src: url('{FONT}') format('woff2'); font-weight: 100 900; }}"


def icon(name, cls="ic"):
    """SVG de un ícono de lucide-react (mismo set que usa la app)."""
    src = (LUCIDE / f"{name}.mjs").read_text(encoding="utf-8")
    alias = re.search(r"export \{ default \} from '\./([\w-]+)\.mjs'", src)  # p. ej. circle-help → circle-question-mark
    if alias:
        return icon(alias.group(1), cls)
    parts = []
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]', src):
        kv = " ".join(f'{k}="{v}"' for k, v in re.findall(r'(\w+): "([^"]*)"', attrs) if k != "key")
        parts.append(f"<{tag} {kv}/>")
    assert parts, f"ícono vacío: {name}"
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round">{"".join(parts)}</svg>')


# Isotipo «Turno» (fuente de verdad: AgendaSalud-Branding/logo/agenda-salud-isotipo.svg)
ISOTIPO = """<svg viewBox="0 0 64 64" class="{cls}"><g fill="{mod}">
<path d="M13 0H25A3 3 0 0 1 28 3V25A3 3 0 0 1 25 28H3A3 3 0 0 1 0 25V13A13 13 0 0 1 13 0Z"/>
<path d="M3 36H25A3 3 0 0 1 28 39V61A3 3 0 0 1 25 64H13A13 13 0 0 1 0 51V39A3 3 0 0 1 3 36Z"/>
<path d="M39 36H61A3 3 0 0 1 64 39V51A13 13 0 0 1 51 64H39A3 3 0 0 1 36 61V39A3 3 0 0 1 39 36Z"/></g>
<circle cx="50" cy="14" r="14" fill="{dot}"/></svg>"""


def iso(cls="", dark=False):
    return ISOTIPO.format(cls=cls, mod="var(--on-primary)" if dark else "var(--primary)",
                          dot="var(--turno-on)" if dark else "var(--turno)")
