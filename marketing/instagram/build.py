"""Genera el carrusel fijado 1 (1080x1350) y la foto de perfil (1080x1080) de @medilu.app.
Uso: python build.py  (requiere Chrome instalado)."""
import pathlib, subprocess, html

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "carrusel-fijado-1"
FONT = (ROOT.parent.parent / "frontend/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2").as_uri()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ISOTIPO = """<svg viewBox="0 0 64 64" class="{cls}"><g fill="{mod}">
<path d="M13 0H25A3 3 0 0 1 28 3V25A3 3 0 0 1 25 28H3A3 3 0 0 1 0 25V13A13 13 0 0 1 13 0Z"/>
<path d="M3 36H25A3 3 0 0 1 28 39V61A3 3 0 0 1 25 64H13A13 13 0 0 1 0 51V39A3 3 0 0 1 3 36Z"/>
<path d="M39 36H61A3 3 0 0 1 64 39V51A13 13 0 0 1 51 64H39A3 3 0 0 1 36 61V39A3 3 0 0 1 39 36Z"/></g>
<circle cx="50" cy="14" r="14" fill="{dot}"/></svg>"""

CSS = f"""
@font-face {{ font-family: Geist; src: url('{FONT}') format('woff2'); font-weight: 100 900; }}
:root {{
  --bg: oklch(0.994 0.003 240); --fg: oklch(0.23 0.03 255); --muted: oklch(0.45 0.03 252);
  --primary: oklch(0.48 0.14 256); --on-primary: oklch(0.985 0.005 240);
  --accent: oklch(0.945 0.028 240); --turno: oklch(0.643 0.111 192); --turno-on: oklch(0.781 0.121 190);
}}
* {{ margin: 0; box-sizing: border-box; }}
html, body {{ width: 1080px; height: 1350px; overflow: hidden; }}
body {{ font-family: Geist, sans-serif; background: var(--bg); color: var(--fg); }}
.slide {{ position: relative; width: 1080px; height: 1350px; padding: 150px 130px; display: flex; flex-direction: column; justify-content: center; }}
.dark {{ background: var(--primary); color: var(--on-primary); }}
.num {{ position: absolute; top: 80px; right: 120px; font-size: 32px; font-weight: 600; color: var(--muted); letter-spacing: .02em; }}
.dark .num {{ color: var(--turno-on); }}
.foot {{ position: absolute; bottom: 80px; left: 130px; right: 120px; display: flex; justify-content: space-between; align-items: center; font-size: 32px; font-weight: 500; color: var(--muted); }}
.dark .foot {{ color: var(--on-primary); opacity: .85; }}
.foot svg {{ width: 56px; height: 56px; }}
.kicker {{ font-size: 34px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 36px; }}
.dark .kicker {{ color: var(--turno-on); }}
h1 {{ font-size: 112px; line-height: 1.02; font-weight: 700; letter-spacing: -.035em; }}
h2 {{ font-size: 84px; line-height: 1.05; font-weight: 700; letter-spacing: -.03em; }}
p {{ font-size: 44px; line-height: 1.35; font-weight: 400; margin-top: 48px; max-width: 800px; }}
.dark p {{ opacity: .92; }}
.dot {{ display: inline-block; width: .62em; height: .62em; border-radius: 50%; background: var(--turno-on); vertical-align: baseline; margin-left: .08em; }}
.big {{ font-size: 60px; line-height: 1.3; font-weight: 500; letter-spacing: -.015em; }}
ul {{ list-style: none; padding: 0; margin-top: 8px; }}
li {{ font-size: 50px; font-weight: 600; padding: 26px 0; border-bottom: 3px solid oklch(0.905 0.012 245); display: flex; align-items: center; gap: 30px; }}
li::before {{ content: ""; width: 26px; height: 26px; border-radius: 7px; background: var(--primary); flex: none; }}
.price {{ margin-top: 56px; font-size: 48px; font-weight: 500; }}
.price b {{ color: var(--primary); font-weight: 700; }}
.cover-iso {{ width: 150px; height: 150px; margin-bottom: 70px; }}
.kw {{ display: inline-block; background: var(--on-primary); color: var(--primary); padding: 6px 28px; border-radius: 18px; font-weight: 700; }}
"""

N = 9
def foot(dark):
    iso = ISOTIPO.format(cls="", mod="var(--on-primary)" if dark else "var(--primary)", dot="var(--turno-on)" if dark else "var(--turno)")
    return f'<div class="foot"><span>@medilu.app</span>{iso}</div>'

def slide(i, body, dark=False):
    return (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
            f'<section class="slide{" dark" if dark else ""}"><div class="num">{i}/{N}</div>{body}{foot(dark)}</section></body></html>')

def feat(kicker, title, text):
    return f'<div class="kicker">{kicker}</div><h2>{html.escape(title)}</h2><p>{html.escape(text)}</p>'

slides = [
    (f'{ISOTIPO.format(cls="cover-iso", mod="var(--on-primary)", dot="var(--turno-on)")}'
     '<h1>Tu consultorio entero en una app<span class="dot"></span></h1>'
     '<p>Turnos, historia clínica y certificados. Sin cuaderno.</p>', True),
    ('<div class="kicker">Hoy</div><div class="big">La agenda está en un cuaderno, las fichas en un cajón y los turnos en tu WhatsApp.<br><br>'
     '<b>Son tres lugares para buscar lo mismo.</b></div>', False),
    (feat("Turnos online", "Tus pacientes sacan turno solos",
          "Eligen el horario desde el celular y les llega la confirmación por mail. Vos no atendés el teléfono."), False),
    (feat("Historia clínica", "La historia clínica, en la ficha",
          "Cada consulta queda guardada con fecha, diagnóstico CIE-10 y obra social. Si no tenés ganas de tipear, la dictás."), False),
    (feat("Certificados", "Certificados con tu firma",
          "Cargás tu firma una vez. Buscás al paciente por DNI y el certificado le queda en su cuenta."), False),
    (feat("Estudios", "Estudios que llegan solos",
          "El paciente sube sus estudios y te los comparte. Se terminó el «te lo mando por WhatsApp»."), False),
    (feat("Especialidades", "Para cualquier especialidad",
          "Clínica, psicología, kinesiología, nutrición. Y si sos odontólogo, trae odontograma por caras."), False),
    ('<div class="kicker">Todo, en una lista</div><ul><li>Turnos online</li><li>Historia clínica con dictado</li>'
     '<li>Certificados con firma</li><li>Estudios compartidos</li></ul>'
     '<div class="price">Desde <b>$14.900</b> por mes, para 1&nbsp;profesional.</div>', False),
    ('<h2>Probalo 14 días gratis, sin tarjeta.</h2>'
     '<p class="big" style="margin-top:64px">Comentá <span class="kw">PRUEBA</span><br>y te escribo.</p>', True),
]

OUT.mkdir(exist_ok=True)
tmp = ROOT / ".tmp"; tmp.mkdir(exist_ok=True)

def shot(htmlstr, png, w, h):
    f = tmp / (png.stem + ".html"); f.write_text(htmlstr, encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--window-size={w},{h}", "--virtual-time-budget=3000", f"--screenshot={png}", f.as_uri()],
                   check=True, capture_output=True)

for i, (body, dark) in enumerate(slides, 1):
    shot(slide(i, body, dark), OUT / f"{i:02d}.png", 1080, 1350)

# Foto de perfil: azul a sangre, isotipo centrado al ~46% (el círculo de IG recorta las esquinas)
perfil = (f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0}}html,body{{width:1080px;height:1080px;overflow:hidden}}'
          f'body{{background:oklch(0.48 0.14 256);display:grid;place-items:center}}svg{{width:500px;height:500px}}</style></head><body>'
          f'{ISOTIPO.format(cls="", mod="oklch(0.985 0.005 240)", dot="oklch(0.781 0.121 190)")}</body></html>')
shot(perfil, ROOT / "foto-perfil.png", 1080, 1080)
print("ok")
