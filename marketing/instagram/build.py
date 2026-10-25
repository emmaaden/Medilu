"""Genera las piezas de Instagram de @medilu.app (ver ../PLAN_MARKETING.md):

  carrusel-fijado-1/   «Qué es Medilu»          9 × 1080×1350
  carrusel-planes/     «Planes y precios»       6 × 1080×1350
  carrusel-contratar/  «Cómo contratar»         7 × 1080×1350
  posts/               posts sueltos            1080×1350
  destacadas/<grupo>/  historias destacadas     1080×1920
  destacadas/portadas/ portadas de destacadas   1080×1920
  foto-perfil.png                               1080×1080

Uso: python build.py  (requiere Chrome instalado y `npm install` hecho en frontend/,
de donde salen la fuente Geist y los íconos de lucide; ver ../marca.py)."""
import pathlib, subprocess, html, sys

ROOT = pathlib.Path(__file__).parent
sys.path.insert(0, str(ROOT.parent))
from marca import CHROME, FONT_FACE, TOKENS, HANDLE, WHATSAPP, DIAS_PRUEBA, ISOTIPO, icon, iso, whatsapp  # noqa: E402

# --- Datos del negocio (verificados contra la tabla `plan` de producción, 2026-10-17) ---
PAGO_ONLINE = False  # True cuando Mercado Pago esté activo en producción
PLANES = [
    # id, nombre, mensual, anual, profesionales, extra, recepción, para quién, qué suma
    dict(nombre="Profesional", mes="14.900", anio="149.000", profs="1 profesional", extra="11.900",
         recepcion="1 recepción incluida", para="Para el profesional independiente",
         suma=["Agenda y turnos online", "Historia clínica con dictado", "Certificados con firma",
               "Estudios y odontograma"]),
    dict(nombre="Equipo", mes="32.900", anio="329.000", profs="3 profesionales", extra="9.900",
         recepcion="Recepción sin tope", para="Para consultorios con equipo",
         suma=["Todo lo del plan Profesional", "Agenda compartida con recepción",
               "Catálogos propios de obras sociales y prácticas"], recomendado=True),
    dict(nombre="Clínica", mes="74.900", anio="749.000", profs="10 profesionales", extra="5.900",
         recepcion="Recepción sin tope", para="Para clínicas y centros",
         suma=["Todo lo del plan Equipo", "Autorizaciones previas de prácticas",
               "Auditoría médica y bitácora de accesos"]),
]


CSS = f"""
{FONT_FACE}
:root {{ {TOKENS} }}
* {{ margin: 0; box-sizing: border-box; }}
html, body {{ width: var(--w); height: var(--h); overflow: hidden; }}
body {{ font-family: Geist, sans-serif; background: var(--bg); color: var(--fg); }}
.slide {{ position: relative; width: var(--w); height: var(--h); padding: 150px 130px; display: flex; flex-direction: column; justify-content: center; }}
.story {{ padding: 280px 110px 300px; }}
.dark {{ background: var(--primary); color: var(--on-primary); }}
.num {{ position: absolute; top: 80px; right: 120px; font-size: 32px; font-weight: 600; color: var(--muted); letter-spacing: .02em; }}
.story .num {{ top: 200px; left: 110px; right: auto; }}
.dark .num {{ color: var(--turno-on); }}
.foot {{ position: absolute; bottom: 80px; left: 130px; right: 120px; display: flex; justify-content: space-between; align-items: center; font-size: 32px; font-weight: 500; color: var(--muted); }}
.story .foot {{ bottom: 200px; left: 110px; right: 110px; }}
.dark .foot {{ color: var(--on-primary); opacity: .85; }}
.foot svg {{ width: 56px; height: 56px; }}
.kicker {{ font-size: 34px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 36px; }}
.dark .kicker {{ color: var(--turno-on); }}
h1 {{ font-size: 112px; line-height: 1.02; font-weight: 700; letter-spacing: -.035em; }}
h2 {{ font-size: 84px; line-height: 1.05; font-weight: 700; letter-spacing: -.03em; }}
p {{ font-size: 44px; line-height: 1.35; font-weight: 400; margin-top: 48px; max-width: 820px; }}
.dark p {{ opacity: .92; }}
.dot {{ display: inline-block; width: .62em; height: .62em; border-radius: 50%; background: var(--turno-on); vertical-align: baseline; margin-left: .08em; }}
.big {{ font-size: 60px; line-height: 1.3; font-weight: 500; letter-spacing: -.015em; }}
ul {{ list-style: none; padding: 0; margin-top: 8px; }}
li {{ font-size: 48px; font-weight: 600; padding: 24px 0; border-bottom: 3px solid var(--border); display: flex; align-items: center; gap: 30px; line-height: 1.2; }}
li::before {{ content: ""; width: 26px; height: 26px; border-radius: 7px; background: var(--primary); flex: none; }}
.dark li {{ border-color: oklch(1 0 0 / .22); }}
.dark li::before {{ background: var(--turno-on); }}
ul.sm li {{ font-size: 38px; font-weight: 500; padding: 18px 0; }}
.price {{ margin-top: 56px; font-size: 48px; font-weight: 500; }}
.price b {{ color: var(--primary); font-weight: 700; }}
.cover-iso {{ width: 150px; height: 150px; margin-bottom: 70px; }}
.kw {{ display: inline-block; background: var(--on-primary); color: var(--primary); padding: 6px 28px; border-radius: 18px; font-weight: 700; }}
.ic {{ width: 1em; height: 1em; flex: none; }}
.feat-ic {{ width: 150px; height: 150px; border-radius: 40px; background: var(--accent); color: var(--primary); display: grid; place-items: center; margin-bottom: 64px; }}
.feat-ic svg {{ width: 84px; height: 84px; }}
.dark .feat-ic {{ background: oklch(1 0 0 / .14); color: var(--on-primary); }}
/* Maquetas de la interfaz */
.card {{ background: var(--card); border: 3px solid var(--border); border-radius: 36px; padding: 48px; margin-top: 72px; box-shadow: 0 24px 60px -30px oklch(0.3 0.08 256 / .35); }}
.dark .card {{ color: var(--fg); border-color: transparent; }}
.btn {{ display: flex; align-items: center; justify-content: center; gap: 18px; height: 112px; border-radius: 24px; font-size: 40px; font-weight: 600; background: var(--primary); color: var(--on-primary); }}
.btn.outline {{ background: var(--card); color: var(--fg); border: 3px solid var(--border); }}
.btn + .btn {{ margin-top: 24px; }}
.btn svg {{ width: 44px; height: 44px; }}
.row {{ display: flex; justify-content: space-between; align-items: center; font-size: 38px; padding: 22px 0; border-bottom: 3px solid var(--border); }}
.row:last-child {{ border-bottom: 0; }}
.row b {{ font-weight: 600; }}
.pill {{ display: inline-flex; align-items: center; gap: 14px; padding: 12px 30px; border-radius: 999px; font-size: 34px; font-weight: 600; background: var(--accent); color: var(--primary); }}
.pill.turno {{ background: oklch(0.643 0.111 192 / .14); color: oklch(0.45 0.09 192); }}
.pill svg {{ width: 38px; height: 38px; }}
.step {{ display: flex; align-items: center; gap: 28px; margin-bottom: 52px; }}
.step .n {{ width: 120px; height: 120px; border-radius: 50%; background: var(--primary); color: var(--on-primary); font-size: 64px; font-weight: 700; display: grid; place-items: center; }}
.step .of {{ font-size: 36px; font-weight: 600; color: var(--muted); }}
.bar {{ display: flex; gap: 12px; margin-top: 18px; }}
.bar i {{ height: 10px; flex: 1; border-radius: 6px; background: var(--border); }}
.bar i.on {{ background: var(--primary); }}
.plan-price {{ font-size: 128px; font-weight: 700; letter-spacing: -.04em; line-height: 1; color: var(--primary); margin-top: 28px; }}
.plan-price small {{ font-size: 44px; font-weight: 500; letter-spacing: 0; color: var(--muted); }}
.badge {{ display: inline-block; padding: 10px 26px; border-radius: 999px; background: var(--turno); color: #fff; font-size: 30px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; margin-left: 20px; vertical-align: middle; }}
.note {{ font-size: 34px; color: var(--muted); margin-top: 28px; }}
.slide:not(.story) .mini {{ gap: 20px; margin-top: 44px; }}
.slide:not(.story) .mini .card {{ padding: 26px 40px; }}
.mini {{ display: grid; gap: 28px; margin-top: 64px; }}
.mini .card {{ margin: 0; padding: 36px 44px; display: flex; justify-content: space-between; align-items: center; }}
.mini .card b {{ font-size: 46px; }}
.mini .card span {{ font-size: 30px; color: var(--muted); display: block; margin-top: 6px; }}
.mini .card em {{ font-style: normal; font-size: 52px; font-weight: 700; color: var(--primary); }}
.wa {{ display: inline-flex; align-items: center; gap: 26px; margin-top: 64px; padding: 34px 54px; border-radius: 32px; background: var(--wa); color: #fff; font-size: 64px; font-weight: 700; letter-spacing: -.01em; }}
.wa svg {{ width: 72px; height: 72px; }}
.q {{ font-size: 40px; font-weight: 600; color: var(--primary); margin-bottom: 30px; }}
.slots {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; }}
.slots span {{ text-align: center; padding: 22px 0; border-radius: 20px; border: 3px solid var(--border); font-size: 36px; font-weight: 600; }}
.slots span.sel {{ background: var(--primary); border-color: var(--primary); color: var(--on-primary); }}
.ok {{ display: flex; align-items: center; gap: 22px; margin-top: 36px; padding: 26px 32px; border-radius: 22px; background: oklch(0.643 0.111 192 / .12); color: oklch(0.42 0.09 192); font-size: 36px; font-weight: 600; }}
.ok svg {{ width: 44px; height: 44px; }}
.navitem {{ display: flex; align-items: center; gap: 22px; font-size: 40px; font-weight: 500; padding: 22px 28px; border-radius: 20px; color: var(--muted); }}
.navitem.on {{ background: var(--accent); color: var(--primary); font-weight: 600; }}
.navitem svg {{ width: 44px; height: 44px; }}
.tap {{ position: absolute; bottom: 300px; right: 110px; font-size: 32px; font-weight: 600; color: var(--muted); }}
.dark .tap {{ color: var(--turno-on); }}
"""


def page(body, w, h, cls):
    return (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><style>:root{{--w:{w}px;--h:{h}px}}{CSS}</style>'
            f'</head><body><section class="slide {cls}">{body}</section></body></html>')


def foot(dark):
    return f'<div class="foot"><span>{HANDLE}</span>{iso(dark=dark)}</div>'


def feat(kicker, title, text, ic=None):
    head = f'<div class="feat-ic">{icon(ic)}</div>' if ic else ""
    return f'{head}<div class="kicker">{kicker}</div><h2>{html.escape(title)}</h2><p>{html.escape(text)}</p>'


# ---------------------------------------------------------------------------
# Posts 1080×1350
# ---------------------------------------------------------------------------
def post_set(slides, numbered=True):
    n = len(slides)
    out = []
    for i, (body, dark) in enumerate(slides, 1):
        num = f'<div class="num">{i}/{n}</div>' if numbered and n > 1 else ""
        out.append(page(num + body + foot(dark), 1080, 1350, "dark" if dark else ""))
    return out


carrusel1 = [
    (f'{iso("cover-iso", True)}<h1>Tu consultorio entero en una app<span class="dot"></span></h1>'
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
     '<li>Certificados con firma</li><li>Estudios compartidos</li><li>Varias clínicas, una cuenta</li></ul>'
     '<div class="price">Desde <b>$14.900</b> por mes, IVA incluido.</div>', False),
    (f'<h2>Probalo {DIAS_PRUEBA} días gratis, sin tarjeta.</h2>'
     '<p class="big" style="margin-top:64px">Comentá <span class="kw">PRUEBA</span><br>y te escribo.</p>'
     f'<p>O escribinos por WhatsApp al <span style="white-space:nowrap">{WHATSAPP}</span>.</p>', True),
]


def plan_slide(p):
    badge = '<span class="badge">Recomendado</span>' if p.get("recomendado") else ""
    items = "".join(f"<li>{html.escape(x)}</li>" for x in [p["profs"], p["recepcion"]] + p["suma"])
    return (f'<div class="kicker">{p["para"]}</div><h2>{p["nombre"]}{badge}</h2>'
            f'<div class="plan-price">${p["mes"]}<small> /mes</small></div>'
            f'<ul class="sm" style="margin-top:32px">{items}</ul>'
            f'<div class="note">Profesional extra: ${p["extra"]} por mes.</div>')


carrusel_planes = [
    (f'{iso("cover-iso", True)}<div class="kicker">Planes</div><h1>¿Cuánto cuesta Medilu?</h1>'
     f'<p>Tres planes, precio final con IVA. Antes de elegir, lo probás {DIAS_PRUEBA} días con todo.</p>', True),
    *[(plan_slide(p), False) for p in PLANES],
    ('<div class="kicker">Pago anual</div><h2>Pagás 10 meses y usás 12</h2>'
     '<div class="mini">' + "".join(
         f'<div class="card"><div><b>{p["nombre"]}</b><span>{p["profs"]}</span></div><em>${p["anio"]}<small style="font-size:30px;color:var(--muted);font-weight:500"> /año</small></em></div>'
         for p in PLANES) + '</div>'
     '<p style="font-size:38px">Solo los profesionales ocupan lugar: la recepción no suma al precio.</p>', False),
    ('<h2>Para tus pacientes, siempre gratis.</h2>'
     '<p>Sacan turno, comparten estudios y ven sus certificados sin pagar nada.</p>'
     '<p class="big" style="margin-top:64px">Comentá <span class="kw">PRUEBA</span><br>y arrancás hoy.</p>', True),
]

post_paciente = [
    ('<div class="kicker">Para pacientes</div><h2>Sacá turno<br>sin llamar.</h2>'
     '<p style="margin-top:32px">Elegís clínica, profesional y horario desde el celular. Es gratis.</p>'
     '<div class="card" style="margin-top:56px"><div class="row"><b>Odontología</b><span>Martes 21</span></div>'
     '<div class="slots"><span>9:00</span><span class="sel">9:30</span><span>10:00</span></div>'
     f'<div class="ok">{icon("circle-check")} Confirmado. Te llegó un mail.</div></div>', False),
]


# ---------------------------------------------------------------------------
# Historias destacadas 1080×1920
# ---------------------------------------------------------------------------
def story_set(slides):
    out = []
    n = len(slides)
    for i, (body, dark) in enumerate(slides, 1):
        tap = '<div class="tap">Tocá para seguir →</div>' if i < n else ""
        out.append(page(body + tap + foot(dark), 1080, 1920, "story " + ("dark" if dark else "")))
    return out


def paso(i, n=4):
    bar = "".join(f'<i class="{"on" if k <= i else ""}"></i>' for k in range(1, n + 1))
    return f'<div class="step"><div class="n">{i}</div><div style="flex:1"><div class="of">Paso {i} de {n}</div><div class="bar">{bar}</div></div></div>'


paso4_texto = ("Pagás con Mercado Pago y queda el débito automático."
               if PAGO_ONLINE else
               "Te escribimos por WhatsApp, confirmamos por escrito y lo activamos en tu clínica.")

contratar = [
    (f'{iso("cover-iso", True)}<h1>Cómo contratar Medilu</h1>'
     f'<p>Son 4 pasos, y los primeros {DIAS_PRUEBA} días no pagás nada.</p>', True),
    (paso(1) + '<h2>Creá tu cuenta de profesional</h2><p>Entrá al link de la bio y tocá <b>Crear cuenta</b>.</p>'
     f'<div class="card"><div class="btn outline">{icon("user-round")} Soy paciente</div>'
     f'<div class="btn">{icon("stethoscope")} Soy profesional</div></div>', False),
    (paso(2) + '<h2>Armá tu consultorio</h2><p>Cargá tu especialidad y tus horarios. Desde ahí, tus pacientes ya pueden sacar turno online.</p>'
     '<div class="card"><div class="row"><b>Lunes a viernes</b><span>9:00 a 13:00</span></div>'
     '<div class="row"><b>Martes y jueves</b><span>16:00 a 20:00</span></div>'
     '<div class="row"><b>Turnos online</b><span class="pill turno">Activados</span></div></div>', False),
    (paso(3) + f'<h2>Probalo {DIAS_PRUEBA} días con todo</h2><p>Arrancás con el plan Clínica completo. Sin tarjeta y sin compromiso.</p>'
     f'<div class="card"><div class="row"><b>Plan Clínica</b><span class="pill">{icon("sparkles")} En prueba</span></div>'
     f'<div class="row"><span>Te quedan</span><b>{DIAS_PRUEBA} días</b></div></div>', False),
    (paso(4) + f'<h2>Elegí tu plan</h2><p>En el panel, entrá a <b>Plan</b> y tocá <b>Contratar</b>. {paso4_texto}</p>'
     f'<div class="card"><div class="navitem">{icon("calendar-days")} Turnos</div>'
     f'<div class="navitem">{icon("file-text")} Registro clínico</div>'
     f'<div class="navitem on">{icon("credit-card")} Plan</div>'
     f'<div class="btn" style="margin-top:28px">Contratar Equipo</div></div>', False),
    ('<div class="kicker">Bueno saber</div><h2>Sin letra chica</h2><ul class="sm" style="margin-top:40px">'
     '<li>Precio final, con IVA incluido</li><li>Pagando el año, 2 meses de regalo</li>'
     '<li>10 días para arrepentirte sin costo</li><li>Das de baja cuando quieras</li>'
     '<li>Si no contratás, tus datos no se borran: quedan en solo lectura y los exportás</li></ul>', False),
    ('<h2>¿Te ayudamos a arrancar?</h2><p>Escribinos y te guiamos paso a paso.</p>'
     f'<div class="wa">{whatsapp()} {WHATSAPP}</div>'
     '<p>O comentá <span class="kw">PRUEBA</span> en cualquier post.</p>', True),
]

# Semana 2 · la destacada «Contratar» como carrusel 1080×1350 (el paso 4, con menos menú para que entre)
carrusel_contratar = [
    *contratar[:4],
    (paso(4) + f'<h2>Elegí tu plan</h2><p>En el panel, entrá a <b>Plan</b> y tocá <b>Contratar</b>. {paso4_texto}</p>'
     f'<div class="card"><div class="navitem">{icon("calendar-days")} Turnos</div>'
     f'<div class="navitem on">{icon("credit-card")} Plan</div>'
     f'<div class="btn" style="margin-top:28px">Contratar Equipo</div></div>', False),
    *contratar[5:],
]

planes_st = [
    (f'<div class="kicker">Planes</div><h2>Un plan para cada consultorio</h2><p style="font-size:40px">Precio final por mes, IVA incluido.</p>'
     '<div class="mini">' + "".join(
         f'<div class="card"><div><b>{p["nombre"]}</b><span>{p["profs"]}</span></div><em>${p["mes"]}</em></div>'
         for p in PLANES) + '</div>'
     f'<p style="font-size:38px">Todos traen agenda, historia clínica con dictado, certificados, estudios y odontograma.</p>', False),
    *[(plan_slide(p), False) for p in PLANES],
    ('<div class="kicker">Pago anual</div><h2>Pagás 10 meses y usás 12</h2>'
     '<div class="mini">' + "".join(
         f'<div class="card"><div><b>{p["nombre"]}</b><span>por año</span></div><em>${p["anio"]}</em></div>'
         for p in PLANES) + '</div>'
     '<p style="font-size:38px">Solo los profesionales ocupan lugar. La recepción no suma al precio.</p>', False),
]

funciones = [
    (feat("Turnos online", "Tus pacientes sacan turno solos",
          "Eligen horario desde el celular y les llega la confirmación por mail.", "calendar-check"), False),
    (feat("Historia clínica", "La dictás y queda en la ficha",
          "Cada consulta con fecha, diagnóstico CIE-10 y obra social. El dictado entiende el vocabulario de tu especialidad.", "mic"), False),
    (feat("Certificados", "Certificados con tu firma",
          "Cargás la firma una vez, buscás al paciente por DNI y el certificado le queda en su cuenta.", "file-signature"), False),
    (feat("Estudios", "Los estudios llegan solos",
          "El paciente los sube a su cuenta y te los comparte. Los ves en su ficha.", "folder-open"), False),
    (feat("Odontología", "Odontograma por caras",
          "Marcás lo realizado y lo que falta tratar, pieza por pieza, en la historia del paciente.", "smile"), False),
    (feat("Equipo", "Recepción y varias clínicas",
          "La recepción maneja la agenda. Y si atendés en más de un lugar, pasás de una clínica a otra con la misma cuenta.", "building-2"), False),
]

pacientes = [
    (f'{iso("cover-iso", True)}<div class="kicker">Para pacientes</div><h1>Para vos, Medilu es gratis</h1>'
     '<p>Siempre. No pagás nada por sacar turnos ni por guardar tus estudios.</p>', True),
    ('<div class="kicker">Turnos</div><h2>Sacá turno desde el celular</h2>'
     '<div class="card"><div class="row"><b>1. Elegí la clínica</b></div><div class="row"><b>2. Elegí profesional y horario</b></div>'
     f'<div class="row"><b>3. Listo</b><span class="pill turno">{icon("mail")} Te llega por mail</span></div></div>'
     '<p>Sin llamar y sin esperar a que te contesten.</p>', False),
    (feat("Tu cuenta", "Tus estudios y certificados, en un solo lugar",
          "Subís tus estudios y se los compartís a tu profesional. Los certificados y tu historia clínica te quedan en la cuenta.",
          "folder-heart"), False),
    ('<h2>¿Tu profesional todavía da turnos por teléfono?</h2><p>Contale de Medilu. A vos te ahorra la llamada; a tu profesional, el cuaderno.</p>'
     f'<p class="big" style="margin-top:64px">Compartí esta historia {icon("send", "ic")}</p>', True),
]

preguntas = [
    (f'<div class="q">¿Necesito tarjeta para probar?</div><h2>No.</h2><p>Creás tu cuenta y usás Medilu {DIAS_PRUEBA} días con todas las funciones. '
     'Al final elegís un plan, si te sirve.</p>', False),
    ('<div class="q">¿Qué pasa si no contrato?</div><h2>No se borra nada.</h2><p>Tu clínica queda en solo lectura: ves y exportás tus datos, '
     'pero no cargás nuevos ni recibís turnos online.</p>', False),
    ('<div class="q">¿Sirve para mi especialidad?</div><h2>Sí.</h2><p>Clínica, psicología, kinesiología, nutrición y más. '
     'Odontología trae además odontograma por caras.</p>', False),
    ('<div class="q">¿Y si un día me quiero ir?</div><h2>Te llevás tus historias.</h2><p>Exportás las historias clínicas de tus pacientes cuando quieras. '
     'Los datos son tuyos.</p>', False),
    ('<div class="q">¿Mis datos están seguros?</div><h2>Cada uno ve solo lo suyo.</h2><p>Profesional, recepción y paciente acceden solo a lo que les corresponde. '
     'En el plan Clínica, además, queda registrado quién vio cada historia.</p>', False),
    ('<h2>¿Otra pregunta?</h2><p>Escribinos, te responde una persona.</p>'
     f'<div class="wa">{whatsapp()} {WHATSAPP}</div>', True),
]

portadas = {
    "1-contratar": "handshake",
    "2-planes": "badge-dollar-sign",
    "3-funciones": "layout-grid",
    "4-pacientes": "heart-handshake",
    "5-preguntas": "circle-help",
}


def portada(ic):
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>:root{{--w:1080px;--h:1920px}}{CSS}'
            'body{display:grid;place-items:center;background:var(--primary);color:var(--on-primary)}'
            '.ic{width:360px;height:360px;stroke-width:1.75}</style></head>'
            f'<body>{icon(ic)}</body></html>')


# ---------------------------------------------------------------------------
tmp = ROOT / ".tmp"; tmp.mkdir(exist_ok=True)


def shot(htmlstr, png, w, h):
    png.parent.mkdir(parents=True, exist_ok=True)
    f = tmp / (png.parent.name + "-" + png.stem + ".html"); f.write_text(htmlstr, encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--window-size={w},{h}", "--virtual-time-budget=3000", f"--screenshot={png}", f.as_uri()],
                   check=True, capture_output=True)


def render(pages, folder, w, h):
    for i, p in enumerate(pages, 1):
        shot(p, ROOT / folder / f"{i:02d}.png", w, h)


render(post_set(carrusel1), "carrusel-fijado-1", 1080, 1350)
render(post_set(carrusel_planes), "carrusel-planes", 1080, 1350)
render(post_set(carrusel_contratar), "carrusel-contratar", 1080, 1350)
shot(post_set(post_paciente)[0], ROOT / "posts" / "paciente-turnos-sin-llamar.png", 1080, 1350)
for nombre, slides in [("contratar", contratar), ("planes", planes_st), ("funciones", funciones),
                       ("pacientes", pacientes), ("preguntas", preguntas)]:
    render(story_set(slides), f"destacadas/{nombre}", 1080, 1920)
for nombre, ic in portadas.items():
    shot(portada(ic), ROOT / "destacadas" / "portadas" / f"{nombre}.png", 1080, 1920)

# Foto de perfil: azul a sangre, isotipo centrado al ~46% (el círculo de IG recorta las esquinas)
perfil = (f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0}}html,body{{width:1080px;height:1080px;overflow:hidden}}'
          f'body{{background:oklch(0.48 0.14 256);display:grid;place-items:center}}svg{{width:500px;height:500px}}</style></head><body>'
          f'{ISOTIPO.format(cls="", mod="oklch(0.985 0.005 240)", dot="oklch(0.781 0.121 190)")}</body></html>')
shot(perfil, ROOT / "foto-perfil.png", 1080, 1080)
print("ok")
