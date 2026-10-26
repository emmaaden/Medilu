"""Videos de Medilu con voz en off (Reels verticales 1080×1920).

Cada escena es HTML con la marca de la app; la locución se genera con una voz neural
rioplatense (edge-tts) y las animaciones y los subtítulos se sincronizan con el tiempo de
cada palabra. Chrome renderiza cuadro a cuadro y ffmpeg arma el MP4.

Requisitos (una vez):  pip install edge-tts playwright imageio-ffmpeg
                       + Chrome instalado + `npm install` en frontend/ (fuente e íconos)
Uso:                   python build_video.py [reel] [--muestras]
Reels (ver REELS):     medilu-video  video ilustrativo fijado (semana 1, por defecto)
                       reel-turno    «turno a las 23:14» (semana 2)
Salida:                el MP4, la portada y el guion de ese reel, en esta carpeta.
"""
import asyncio, html, json, pathlib, re, subprocess, sys

import edge_tts
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent
sys.path.insert(0, str(ROOT.parent))
from marca import FONT_FACE, TOKENS, WHATSAPP, HANDLE, DIAS_PRUEBA, icon, iso, whatsapp  # noqa: E402

VOZ = "es-UY-ValentinaNeural"  # rioplatense y más fluida que es-AR-ElenaNeural; masculina: es-AR-TomasNeural
VELOCIDAD = "+0%"  # acelerarla la hace sonar trabada
FPS = 30
W, H = 1080, 1920
LEAD, TAIL, FINAL = 0.3, 0.4, 2.2  # silencio antes/después de cada locución y al cierre
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()



def C(texto, dicho=None):
    """Un fragmento de locución: lo que se muestra en el subtítulo y, si difiere, lo que se dice."""
    return (texto, dicho or texto)


def palabras(s):
    return [w for w in s.split() if any(c.isalnum() for c in w)]


def tooth(caras):
    """Pieza del odontograma por caras (convención de la app: rojo realizado, azul a tratar)."""
    col = {"r": "oklch(0.58 0.2 25)", "a": "var(--primary)", "": "#fff"}
    polys = ["0,0 100,0 70,30 30,30", "100,0 100,100 70,70 70,30", "0,100 100,100 70,70 30,70",
             "0,0 0,100 30,70 30,30"]
    s = "".join(f'<polygon points="{p}" fill="{col[c]}"/>' for p, c in zip(polys, caras[:4]))
    s += f'<rect x="30" y="30" width="40" height="40" fill="{col[caras[4]]}"/>'
    return (f'<svg viewBox="-3 -3 106 106" class="tooth"><g stroke="var(--fg)" stroke-width="3" '
            f'stroke-linejoin="round">{s}</g></svg>')


def dictado(texto, d0, paso=0.16):
    return " ".join(f'<span class="a fade" style="--d:{d0 + i * paso:.2f}s">{html.escape(w)}</span>'
                    for i, w in enumerate(texto.split()))


# ---------------------------------------------------------------------------
# Guion. En el HTML, {c0}, {c1}… es el segundo (dentro de la escena) en que empieza a
# decirse cada fragmento: así lo que aparece en pantalla coincide con la voz.
# ---------------------------------------------------------------------------
ESCENAS = [
    dict(vo=[C("¿Todavía das turnos por teléfono"), C("a tus pacientes?")], html=lambda c: f"""
        <div class="a pop ring-ic" style="--d:0s"><div class="wiggle">{icon("phone")}</div></div>
        <h1 class="a rise center" style="--d:{c[0]}s">¿Todavía das turnos por teléfono?</h1>"""),

    dict(vo=[C("La agenda en un cuaderno,"), C("las fichas en un cajón"), C("y los turnos en tu WhatsApp.")],
         html=lambda c: f"""
        <div class="mess">
          <div class="a drop card mcard" style="--d:{c[0]}s;--r:-4deg">{icon("notebook-pen")}<b>La agenda</b><span>en un cuaderno</span></div>
          <div class="a drop card mcard" style="--d:{c[1]}s;--r:3deg">{icon("archive")}<b>Las fichas</b><span>en un cajón</span></div>
          <div class="a drop card mcard" style="--d:{c[2]}s;--r:-2deg">{whatsapp()}<b>Los turnos</b><span>en tu WhatsApp</span></div>
        </div>"""),

    dict(dark=True, vo=[C("Con Medilu,"), C("tu consultorio entero entra en una app.")], html=lambda c: f"""
        <div class="a pop" style="--d:0s">{iso("hero-iso", True)}</div>
        <div class="a rise wordmark" style="--d:{c[0] + .25}s">Medi<span>lu</span></div>
        <p class="a rise center" style="--d:{c[1]}s">Tu consultorio entero en una app</p>"""),

    dict(vo=[C("Tus pacientes sacan turno solos desde el celular"), C("y les llega la confirmación por mail.")],
         html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Turnos online</div>
        <div class="a rise phone" style="--d:.1s">
          <div class="ph-title">Elegí horario</div>
          <div class="days"><span>Lun 20</span><span class="on">Mar 21</span><span>Mié 22</span></div>
          <div class="slots"><span>9:00</span><span class="pick" style="--d:{c[0] + 1.3}s">9:30</span><span>10:00</span>
            <span>10:30</span><span>11:00</span><span>11:30</span></div>
          <div class="a slide toast" style="--d:{c[1]}s">{icon("mail")}<div><b>Turno confirmado</b><span>Te llegó un mail</span></div></div>
        </div>"""),

    dict(vo=[C("En la consulta, dictás la historia clínica"), C("y queda guardada en la ficha,"),
             C("con diagnóstico y obra social.")], html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Historia clínica</div>
        <div class="a rise card big-card" style="--d:.1s">
          <div class="mic-row"><div class="mic">{icon("mic")}<i class="ring"></i></div><b>Dictando…</b></div>
          <p class="dict">{dictado("Refiere dolor al frío en la pieza 36. Se observa caries de dentina. Se indica obturación.", c[0] + .3)}</p>
          <div class="a pop okline" style="--d:{c[1]}s">{icon("circle-check")} Guardado en la ficha</div>
          <div class="chips">
            <span class="a pop pill" style="--d:{c[2] + .2}s">CIE-10 · K02.1 Caries de la dentina</span>
            <span class="a pop pill turno" style="--d:{c[2] + .9}s">Obra social</span>
          </div>
        </div>"""),

    dict(vo=[C("Hacés certificados con tu firma,"), C("y el paciente los recibe en su cuenta"),
             C("junto con sus estudios.")], html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Certificados</div>
        <div class="a rise card cert" style="--d:.1s">
          <div class="cert-t">Certificado médico</div>
          <i class="ln" style="width:92%"></i><i class="ln" style="width:78%"></i><i class="ln" style="width:85%"></i><i class="ln" style="width:55%"></i>
          <svg class="sig" viewBox="0 0 400 120"><path class="a draw" style="--d:{c[0] + .4}s" pathLength="1"
            d="M10 80 C 40 20, 60 20, 70 70 S 100 110, 120 60 S 150 10, 170 60 C 180 85, 195 90, 210 60 C 222 38, 240 40, 245 62 C 250 82, 268 84, 290 55 L 300 45 C 320 70, 350 75, 390 40"/></svg>
          <div class="sig-l">Firma del profesional</div>
        </div>
        <div class="a slide toast inline" style="--d:{c[1]}s">{icon("send")}<div><b>Enviado</b><span>a la cuenta del paciente</span></div></div>
        <div class="chips center-chips">
          <span class="a pop pill" style="--d:{c[2]}s">{icon("paperclip")} Radiografía.pdf</span>
          <span class="a pop pill" style="--d:{c[2] + .35}s">{icon("paperclip")} Análisis.pdf</span>
        </div>"""),

    dict(vo=[C("Sirve para cualquier especialidad,"), C("y si sos odontólogo, trae odontograma.")],
         html=lambda c: f"""
        <div class="chips center-chips spec">
          {"".join(f'<span class="a pop pill" style="--d:{c[0] + i * .18:.2f}s">{e}</span>' for i, e in enumerate(
              ["Clínica médica", "Psicología", "Kinesiología", "Nutrición", "Pediatría", "Odontología"]))}
        </div>
        <div class="a rise card odo" style="--d:{c[1] + .6}s">
          <div class="odo-t">Odontograma</div>
          <div class="teeth">{"".join(f'<div class="a pop" style="--d:{c[1] + .8 + i * .08:.2f}s">{tooth(t)}<small>{n}</small></div>' for i, (n, t) in enumerate(zip(
              [18, 17, 16, 15, 14, 13, 12, 11],
              [["", "", "", "", ""], ["", "", "r", "", "r"], ["a", "", "", "", ""], ["", "", "", "", ""],
               ["", "r", "", "", ""], ["", "", "", "", ""], ["", "", "", "a", "a"], ["", "", "", "", ""]])))}</div>
          <div class="legend"><span><i style="background:oklch(0.58 0.2 25)"></i>Realizado</span><span><i style="background:var(--primary)"></i>A tratar</span></div>
        </div>"""),

    dict(vo=[C("Y para tus pacientes,"), C("Medilu es gratis.")], html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Para el paciente</div>
        <div class="a rise phone menu" style="--d:.1s">
          {"".join(f'<div class="a rise mi" style="--d:{.4 + i * .22:.2f}s">{icon(ic)}<b>{t}</b></div>' for i, (ic, t) in enumerate(
              [("calendar-days", "Mis turnos"), ("folder-open", "Mis estudios"), ("file-text", "Mis certificados"), ("heart-pulse", "Mi historia")]))}
          <div class="a stamp gratis" style="--d:{c[1] + .15}s">Gratis</div>
        </div>"""),

    dict(vo=[C("Contratarlo es simple:"), C("creás tu cuenta de profesional,"),
             C(f"lo probás {DIAS_PRUEBA} días con todo, sin tarjeta,", "lo probás catorce días con todo, sin tarjeta,"),
             C("y elegís tu plan desde el panel.")], html=lambda c: f"""
        <h2 class="a rise" style="--d:0s">Cómo contratar</h2>
        <div class="steps">
          <div class="a slideL card step" style="--d:{c[1]}s"><i>1</i><div><b>Creá tu cuenta</b><span>Soy profesional</span></div></div>
          <div class="a slideL card step" style="--d:{c[2]}s"><i>2</i><div><b>Probalo {DIAS_PRUEBA} días</b><span>Con todo y sin tarjeta</span></div></div>
          <div class="a slideL card step" style="--d:{c[3]}s"><i>3</i><div><b>Elegí tu plan</b><span>Desde el panel, en «Plan»</span></div></div>
        </div>"""),

    dict(vo=[C("Hay planes desde $14.900 por mes,", "Hay planes desde catorce mil novecientos pesos por mes,"),
             C("con IVA incluido.")], html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Planes</div>
        <div class="a pop price" style="--d:{c[0] + .5}s"><small>desde</small>$14.900<small>/mes</small></div>
        <div class="minis">
          {"".join(f'<div class="a rise card mini" style="--d:{c[0] + 1.2 + i * .2:.2f}s"><b>{n}</b><span>{p}</span><em>${m}</em></div>' for i, (n, p, m) in enumerate(
              [("Profesional", "1 profesional", "14.900"), ("Equipo", "3 profesionales", "32.900"), ("Clínica", "10 profesionales", "74.900")]))}
        </div>
        <p class="a rise center muted" style="--d:{c[1]}s">IVA incluido · Pagando el año, 2 meses de regalo</p>"""),

    dict(dark=True, vo=[C("Probalo gratis:"), C("escribinos por WhatsApp y empezá hoy."),
                        C("Medilu: tu consultorio entero, en una app.")], html=lambda c: f"""
        <div class="a pop" style="--d:0s">{iso("hero-iso sm", True)}</div>
        <h2 class="a rise center" style="--d:{c[0]}s">Probalo {DIAS_PRUEBA} días gratis</h2>
        <div class="a pop wa" style="--d:{c[1] + .3}s">{whatsapp()} {WHATSAPP}</div>
        <div class="a rise wordmark sm" style="--d:{c[2]}s">Medi<span>lu</span></div>
        <p class="a rise center" style="--d:{c[2] + .5}s">{HANDLE} · link en la bio</p>"""),
]

# Semana 2 · «Turno a las 23:14»: el turno online visto por el profesional (datos ficticios).
ESCENAS_TURNO = [
    dict(dark=True, vo=[C("Once y catorce de la noche."), C("Una paciente acaba de sacar turno con vos.")],
         html=lambda c: f"""
        <div class="a pop clock" style="--d:0s">23:14</div>
        <h2 class="a rise center bal" style="--d:{c[1]}s">Una paciente acaba de sacar turno con vos</h2>"""),

    dict(vo=[C("Eligió tu clínica,"), C("tu nombre"), C("y el martes a las nueve y media.")], html=lambda c: f"""
        <div class="a rise phone" style="--d:0s">
          <div class="a rise pick-row" style="--d:{c[0]}s">{icon("building-2")}<div><span>Clínica</span><b>Consultorio Centro</b></div></div>
          <div class="a rise pick-row" style="--d:{c[1]}s">{icon("stethoscope")}<div><span>Profesional</span><b>Dr. Martín Ruiz</b></div></div>
          <div class="a rise days" style="--d:{c[2]}s"><span>Lun 2</span><span class="on">Mar 3</span><span>Mié 4</span></div>
          <div class="a rise slots" style="--d:{c[2] + .2}s"><span>9:00</span><span class="pick" style="--d:{c[2] + 1.2}s">9:30</span><span>10:00</span></div>
        </div>"""),

    dict(vo=[C("Le llegó la confirmación por mail,"), C("y un día antes le llega el recordatorio.")], html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Por mail</div>
        <div class="mails">
          <div class="a slide toast" style="--d:{c[0] + .2}s">{icon("mail-check")}<div><b>Turno confirmado</b><span>Martes 3 · 9:30</span></div></div>
          <div class="a slide toast" style="--d:{c[1] + .2}s">{icon("bell")}<div><b>Recordatorio</b><span>Mañana 9:30 · Consultorio Centro</span></div></div>
        </div>"""),

    dict(vo=[C("Y si no puede venir,"), C("lo cancela desde ese mismo mail.")], html=lambda c: f"""
        <div class="a rise card big-card" style="--d:0s">
          <div class="mail-t">{icon("mail")} Tu turno en Medilu</div>
          <div class="row-v"><span>Martes 3 · 9:30</span><b>Dr. Martín Ruiz</b></div>
          <div class="a pop btn-o" style="--d:{c[1]}s">{icon("calendar-x")} Cancelar turno</div>
        </div>
        <p class="a rise center muted" style="--d:{c[1] + .5}s">Sin llamarte y sin mandarte un WhatsApp</p>"""),

    dict(vo=[C("A la mañana, el turno ya está en tu agenda."), C("Nadie atendió el teléfono.")], html=lambda c: f"""
        <div class="a rise kicker" style="--d:0s">Tu agenda</div>
        <div class="a rise card agenda" style="--d:.1s">
          <div class="ag-t"><b>Martes 3</b><span>3 turnos</span></div>
          <div class="ag-row"><i>9:00</i><div class="ag-slot"><b>Carlos Pérez</b><span>Control</span></div></div>
          <div class="ag-row"><i>9:30</i><div class="a pop ag-slot new" style="--d:.6s"><b>Laura Méndez</b><span class="pill turno">{icon("globe")} Online</span></div></div>
          <div class="ag-row"><i>10:00</i><div class="ag-slot"><b>Ana Torres</b><span>Primera vez</span></div></div>
        </div>
        <div class="a pop okline" style="--d:{c[1]}s">{icon("phone-off")} Cero llamadas</div>"""),

    dict(dark=True, vo=[C(f"Probalo {DIAS_PRUEBA} días gratis.", "Probalo catorce días gratis."), C("Comentá PRUEBA y te escribimos.")],
         html=lambda c: f"""
        <div class="a pop" style="--d:0s">{iso("hero-iso sm", True)}</div>
        <h2 class="a rise center" style="--d:{c[0]}s">Probalo {DIAS_PRUEBA} días gratis</h2>
        <div class="a pop kw" style="--d:{c[1] + .2}s">Comentá PRUEBA</div>
        <p class="a rise center" style="--d:{c[1] + .8}s">{HANDLE} · sin tarjeta</p>"""),
]

# nombre → escenas, archivos de salida y escena de la portada
REELS = {
    "medilu-video": dict(escenas=ESCENAS, mp4="medilu-video.mp4", portada="portada.png", guion="guion.txt", escena_portada=2),
    "reel-turno": dict(escenas=ESCENAS_TURNO, mp4="reel-turno.mp4", portada="reel-turno-portada.png",
                       guion="reel-turno-guion.txt", escena_portada=0),
}

CSS = f"""
{FONT_FACE}
:root {{ {TOKENS} }}
* {{ margin: 0; box-sizing: border-box; }}
html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: var(--bg); }}
body {{ font-family: Geist, sans-serif; color: var(--fg); }}
.ic {{ width: 1em; height: 1em; flex: none; }}
.scene {{ position: absolute; inset: 0; padding: 230px 90px 600px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 44px; background: var(--bg);
  animation: sceneIn .45s cubic-bezier(.2,.8,.2,1) both, sceneOut .35s ease-in forwards;
  animation-delay: var(--t0), calc(var(--t1) - .35s); }}
.scene.dark {{ background: var(--primary); color: var(--on-primary); }}
.a {{ animation: var(--k, rise) .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--t0) + var(--d, 0s)); }}
.rise {{ --k: rise; }} .pop {{ --k: pop; }} .fade {{ --k: fade; }} .slide {{ --k: slide; }} .slideL {{ --k: slideL; }}
.drop {{ --k: drop; }} .stamp {{ --k: stamp; }}
@keyframes sceneIn {{ from {{ opacity: 0; transform: scale(1.03); }} to {{ opacity: 1; transform: none; }} }}
@keyframes sceneOut {{ to {{ opacity: 0; }} }}
@keyframes rise {{ from {{ opacity: 0; transform: translateY(46px); }} to {{ opacity: 1; transform: none; }} }}
@keyframes pop {{ 0% {{ opacity: 0; transform: scale(.6); }} 60% {{ opacity: 1; transform: scale(1.06); }} 100% {{ opacity: 1; transform: scale(1); }} }}
@keyframes fade {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
@keyframes slide {{ from {{ opacity: 0; transform: translateY(80px); }} to {{ opacity: 1; transform: none; }} }}
@keyframes slideL {{ from {{ opacity: 0; transform: translateX(-120px); }} to {{ opacity: 1; transform: none; }} }}
@keyframes drop {{ from {{ opacity: 0; transform: translateY(-160px) rotate(calc(var(--r) * 4)); }} to {{ opacity: 1; transform: rotate(var(--r)); }} }}
@keyframes stamp {{ 0% {{ opacity: 0; transform: rotate(-12deg) scale(2.2); }} 70% {{ opacity: 1; transform: rotate(-12deg) scale(.94); }} 100% {{ opacity: 1; transform: rotate(-12deg) scale(1); }} }}
@keyframes wiggle {{ 0%, 40%, 100% {{ transform: rotate(0); }} 5%, 15%, 25% {{ transform: rotate(-14deg); }} 10%, 20%, 30% {{ transform: rotate(14deg); }} }}
@keyframes ring {{ from {{ transform: scale(1); opacity: .55; }} to {{ transform: scale(1.9); opacity: 0; }} }}
@keyframes draw {{ from {{ stroke-dashoffset: 1; }} to {{ stroke-dashoffset: 0; }} }}
@keyframes pick {{ to {{ background: var(--primary); border-color: var(--primary); color: var(--on-primary); transform: scale(1.06); }} }}
h1 {{ font-size: 104px; line-height: 1.04; font-weight: 700; letter-spacing: -.035em; }}
h2 {{ font-size: 88px; line-height: 1.05; font-weight: 700; letter-spacing: -.03em; }}
p {{ font-size: 48px; line-height: 1.3; }}
.center {{ text-align: center; }}
.bal {{ text-wrap: balance; }}
.muted {{ color: var(--muted); }}
.kicker {{ font-size: 38px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: .08em; }}
.card {{ background: var(--card); color: var(--fg); border: 3px solid var(--border); border-radius: 40px;
  box-shadow: 0 30px 70px -36px oklch(0.3 0.08 256 / .45); }}
.dark .card {{ border-color: transparent; }}
.ring-ic {{ width: 240px; height: 240px; border-radius: 70px; background: var(--accent); color: var(--primary); display: grid; place-items: center; }}
.ring-ic .wiggle {{ animation: wiggle 1.6s ease-in-out infinite; animation-delay: var(--t0); display: grid; }}
.ring-ic svg {{ width: 130px; height: 130px; }}
.mess {{ display: grid; gap: 40px; width: 100%; }}
.mcard {{ display: grid; grid-template-columns: 110px 1fr; grid-template-rows: auto auto; column-gap: 36px; padding: 44px 52px; align-items: center; }}
.mcard svg {{ grid-row: span 2; width: 96px; height: 96px; color: var(--primary); }}
.mcard b {{ font-size: 58px; letter-spacing: -.02em; }}
.mcard span {{ font-size: 44px; color: var(--muted); }}
.hero-iso {{ width: 260px; height: 260px; }}
.hero-iso.sm {{ width: 170px; height: 170px; }}
.wordmark {{ font-size: 190px; font-weight: 700; letter-spacing: -.05em; line-height: 1; }}
.wordmark.sm {{ font-size: 120px; margin-top: 30px; }}
.wordmark span {{ color: var(--turno-on); }}
.phone {{ width: 640px; padding: 56px 44px; border-radius: 72px; background: var(--card); border: 14px solid oklch(0.23 0.03 255);
  box-shadow: 0 40px 90px -40px oklch(0.3 0.08 256 / .6); display: flex; flex-direction: column; gap: 34px; position: relative; }}
.ph-title {{ font-size: 50px; font-weight: 700; letter-spacing: -.02em; }}
.days {{ display: flex; gap: 16px; }}
.days span {{ flex: 1; text-align: center; padding: 20px 0; border-radius: 22px; background: var(--accent); font-size: 32px; font-weight: 600; color: var(--muted); }}
.days span.on {{ background: var(--fg); color: #fff; }}
.slots {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }}
.slots span {{ text-align: center; padding: 26px 0; border-radius: 22px; border: 3px solid var(--border); font-size: 38px; font-weight: 600; background: #fff; }}
.slots .pick {{ animation: pick .35s ease-out forwards; animation-delay: calc(var(--t0) + var(--d)); }}
.toast {{ display: flex; align-items: center; gap: 26px; padding: 30px 34px; border-radius: 28px; background: oklch(0.643 0.111 192 / .14); color: oklch(0.38 0.09 192); }}
.toast svg {{ width: 60px; height: 60px; }}
.toast b {{ display: block; font-size: 40px; }}
.toast span {{ font-size: 32px; }}
.toast.inline {{ background: var(--card); border: 3px solid var(--border); width: 100%; }}
.big-card {{ width: 100%; padding: 52px; display: flex; flex-direction: column; gap: 34px; }}
.mic-row {{ display: flex; align-items: center; gap: 30px; font-size: 40px; color: var(--primary); }}
.mic {{ position: relative; width: 110px; height: 110px; border-radius: 50%; background: var(--primary); color: #fff; display: grid; place-items: center; }}
.mic svg {{ width: 56px; height: 56px; position: relative; z-index: 1; }}
.mic .ring {{ position: absolute; inset: 0; border-radius: 50%; background: var(--primary); animation: ring 1.2s ease-out infinite; animation-delay: var(--t0); }}
.dict {{ font-size: 46px; line-height: 1.38; min-height: 192px; }}
.okline {{ display: flex; align-items: center; gap: 18px; font-size: 38px; font-weight: 600; color: oklch(0.42 0.09 192); }}
.okline svg {{ width: 48px; height: 48px; }}
.chips {{ display: flex; flex-wrap: wrap; gap: 18px; }}
.center-chips {{ justify-content: center; }}
.pill {{ display: inline-flex; align-items: center; gap: 14px; padding: 16px 32px; border-radius: 999px; font-size: 36px; font-weight: 600; background: var(--accent); color: var(--primary); }}
.pill svg {{ width: 38px; height: 38px; }}
.pill.turno {{ background: oklch(0.643 0.111 192 / .16); color: oklch(0.4 0.09 192); }}
.spec .pill {{ font-size: 44px; padding: 22px 42px; }}
.cert {{ width: 100%; padding: 60px 64px; display: flex; flex-direction: column; gap: 26px; }}
.cert-t {{ font-size: 54px; font-weight: 700; letter-spacing: -.02em; margin-bottom: 14px; }}
.ln {{ display: block; height: 22px; border-radius: 11px; background: var(--accent); }}
.sig {{ width: 420px; height: 130px; margin-top: 20px; }}
.sig path {{ fill: none; stroke: var(--primary); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 1; --k: draw; animation-duration: 1.4s; animation-timing-function: ease-in-out; }}
.sig-l {{ font-size: 30px; color: var(--muted); border-top: 3px solid var(--border); padding-top: 14px; width: 420px; }}
.odo {{ width: 100%; padding: 46px 40px; display: flex; flex-direction: column; gap: 28px; }}
.odo-t {{ font-size: 44px; font-weight: 700; }}
.teeth {{ display: grid; grid-template-columns: repeat(8, 1fr); gap: 14px; }}
.teeth > div {{ display: flex; flex-direction: column; align-items: center; gap: 8px; }}
.tooth {{ width: 100%; }}
.teeth small {{ font-size: 28px; color: var(--muted); font-weight: 600; }}
.legend {{ display: flex; gap: 40px; font-size: 32px; color: var(--muted); }}
.legend i {{ display: inline-block; width: 28px; height: 28px; border-radius: 8px; margin-right: 12px; vertical-align: -4px; }}
.menu {{ gap: 22px; }}
.mi {{ display: flex; align-items: center; gap: 30px; padding: 30px 32px; border-radius: 28px; background: var(--accent); font-size: 46px; }}
.mi svg {{ width: 60px; height: 60px; color: var(--primary); }}
.gratis {{ position: absolute; right: -110px; top: -70px; padding: 22px 50px; border-radius: 28px; background: var(--turno); color: #fff;
  font-size: 72px; font-weight: 800; letter-spacing: -.02em; box-shadow: 0 20px 40px -18px oklch(0.4 0.1 192 / .7); }}
.steps {{ display: grid; gap: 34px; width: 100%; }}
.step {{ display: flex; align-items: center; gap: 40px; padding: 44px 50px; }}
.step i {{ font-style: normal; width: 120px; height: 120px; flex: none; border-radius: 50%; background: var(--primary); color: #fff; font-size: 64px; font-weight: 700; display: grid; place-items: center; }}
.step b {{ display: block; font-size: 58px; letter-spacing: -.02em; }}
.step span {{ font-size: 40px; color: var(--muted); }}
.price {{ font-size: 176px; font-weight: 700; letter-spacing: -.05em; color: var(--primary); line-height: 1; display: flex; align-items: baseline; gap: 18px; }}
.price small {{ font-size: 50px; letter-spacing: 0; color: var(--muted); font-weight: 500; }}
.minis {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; width: 100%; }}
.mini {{ padding: 36px 30px; display: flex; flex-direction: column; gap: 6px; }}
.mini b {{ font-size: 40px; }}
.mini span {{ font-size: 28px; color: var(--muted); }}
.mini em {{ font-style: normal; font-size: 48px; font-weight: 700; color: var(--primary); margin-top: 14px; }}
.wa {{ display: inline-flex; align-items: center; gap: 26px; padding: 36px 60px; border-radius: 36px; background: var(--wa); color: #fff; font-size: 76px; font-weight: 700; }}
.wa svg {{ width: 84px; height: 84px; }}
/* Reel «turno a las 23:14» */
.clock {{ font-size: 260px; font-weight: 700; letter-spacing: -.05em; line-height: 1; color: var(--turno-on); font-variant-numeric: tabular-nums; }}
.pick-row {{ display: flex; align-items: center; gap: 26px; padding: 26px 30px; border-radius: 26px; background: var(--accent); }}
.pick-row svg {{ width: 56px; height: 56px; color: var(--primary); }}
.pick-row span {{ display: block; font-size: 28px; color: var(--muted); }}
.pick-row b {{ font-size: 40px; }}
.mails {{ display: grid; gap: 30px; width: 100%; }}
.mails .toast {{ padding: 40px 44px; }}
.mails .toast b {{ font-size: 48px; }}
.mails .toast span {{ font-size: 36px; }}
.mail-t {{ display: flex; align-items: center; gap: 20px; font-size: 44px; font-weight: 700; }}
.mail-t svg {{ width: 56px; height: 56px; color: var(--primary); }}
.row-v {{ display: flex; flex-direction: column; gap: 8px; padding: 30px 0; border-top: 3px solid var(--border); border-bottom: 3px solid var(--border); }}
.row-v span {{ font-size: 54px; font-weight: 700; letter-spacing: -.02em; }}
.row-v b {{ font-size: 38px; font-weight: 500; color: var(--muted); }}
.btn-o {{ display: flex; align-items: center; justify-content: center; gap: 18px; height: 116px; border-radius: 26px; border: 3px solid var(--border); font-size: 42px; font-weight: 600; }}
.btn-o svg {{ width: 48px; height: 48px; color: oklch(0.58 0.2 25); }}
.agenda {{ width: 100%; padding: 44px; display: flex; flex-direction: column; gap: 22px; }}
.ag-t {{ display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 14px; }}
.ag-t b {{ font-size: 50px; letter-spacing: -.02em; }}
.ag-t span {{ font-size: 34px; color: var(--muted); }}
.ag-row {{ display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 20px; }}
.ag-row i {{ font-style: normal; font-size: 36px; font-weight: 600; color: var(--muted); }}
.ag-slot {{ display: flex; justify-content: space-between; align-items: center; padding: 28px 30px; border-radius: 24px; background: var(--accent); }}
.ag-slot b {{ font-size: 40px; }}
.ag-slot > span {{ font-size: 32px; color: var(--muted); }}
.ag-slot.new {{ background: var(--card); border: 4px solid var(--turno); box-shadow: 0 20px 40px -24px oklch(0.4 0.1 192 / .6); }}
.kw {{ padding: 30px 64px; border-radius: 32px; background: var(--on-primary); color: var(--primary); font-size: 80px; font-weight: 800; letter-spacing: -.02em; }}
/* Subtítulos: por encima de la zona que tapa la interfaz de Reels */
.caps {{ position: absolute; z-index: 100; left: 70px; right: 70px; top: 1380px; height: 260px; display: grid; place-items: center; }}
.cap {{ grid-area: 1 / 1; text-align: center; font-size: 56px; line-height: 1.32; font-weight: 600; opacity: 0;
  animation: capIn .18s ease-out forwards, capOut .15s ease-in forwards; animation-delay: var(--s), var(--e); }}
.cap span {{ background: var(--fg); color: #fff; padding: 6px 22px; border-radius: 16px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }}
@keyframes capIn {{ from {{ opacity: 0; transform: translateY(14px); }} to {{ opacity: 1; transform: none; }} }}
@keyframes capOut {{ to {{ opacity: 0; }} }}
"""


async def _tts(texto, mp3):
    com = edge_tts.Communicate(texto, VOZ, rate=VELOCIDAD, boundary="WordBoundary")
    marcas = []
    with open(mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                marcas.append(ch["offset"] / 1e7)
    return marcas


def tts(texto, mp3):
    """Locución + segundo de cada palabra. Se reutiliza si el texto y la voz no cambiaron."""
    meta = mp3.with_suffix(".json")
    clave = {"texto": texto, "voz": VOZ, "velocidad": VELOCIDAD}
    if mp3.exists() and meta.exists():
        guardado = json.loads(meta.read_text(encoding="utf-8"))
        if guardado["clave"] == clave:
            return guardado["marcas"]
    marcas = asyncio.run(_tts(texto, mp3))
    meta.write_text(json.dumps({"clave": clave, "marcas": marcas}, ensure_ascii=False), encoding="utf-8")
    return marcas


def duracion(mp3):
    err = subprocess.run([FFMPEG, "-i", str(mp3)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def main(nombre="medilu-video", muestras=False):
    reel = REELS[nombre]
    ESCENAS = reel["escenas"]
    TMP = ROOT / ".tmp" / nombre
    TMP.mkdir(parents=True, exist_ok=True)
    t, escenas_html, caps, audios, guion = 0.0, [], [], [], []
    for i, esc in enumerate(ESCENAS):
        dicho = " ".join(d for _, d in esc["vo"])
        mp3 = TMP / f"vo-{i:02d}.mp3"
        marcas = tts(dicho, mp3)
        dur = duracion(mp3)
        # Comienzo de cada fragmento según el tiempo de su primera palabra.
        n, inicios = 0, []
        for _, d in esc["vo"]:
            inicios.append(marcas[n] if n < len(marcas) else dur * n / max(1, len(palabras(dicho))))
            n += len(palabras(d))
        if len(marcas) != n:
            print(f"aviso: escena {i}: {len(marcas)} marcas de palabra para {n} palabras")
        c = [round(LEAD + x, 2) for x in inicios]
        largo = LEAD + dur + (FINAL if i == len(ESCENAS) - 1 else TAIL)
        t0, t1 = t, t + largo
        cls = "scene dark" if esc.get("dark") else "scene"
        escenas_html.append(f'<section class="{cls}" style="--t0:{t0:.3f}s;--t1:{t1:.3f}s;z-index:{i}">{esc["html"](c)}</section>')
        for k, (texto, _) in enumerate(esc["vo"]):
            s = t0 + c[k]
            e = t0 + c[k + 1] - .05 if k + 1 < len(c) else t0 + LEAD + dur + .15
            caps.append(f'<div class="cap" style="--s:{s:.3f}s;--e:{e:.3f}s"><span>{html.escape(texto)}</span></div>')
        audios.append((mp3, t0 + LEAD))
        guion.append(f"[{t0:5.1f}s] " + " ".join(tx for tx, _ in esc["vo"]))
        t = t1
    total = t
    (ROOT / reel["guion"]).write_text("\n".join(guion) + f"\n\nDuración: {total:.1f} s · Voz: {VOZ}\n", encoding="utf-8")

    page_html = (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
                 f'{"".join(escenas_html)}<div class="caps">{"".join(caps)}</div>'
                 '<script>window.seek=t=>{for(const a of document.getAnimations()){a.pause();a.currentTime=t*1000}}</script>'
                 '</body></html>')
    pagina = TMP / "video.html"
    pagina.write_text(page_html, encoding="utf-8")

    # Pista de audio: cada locución en su lugar de la línea de tiempo.
    wav = TMP / "voz.wav"
    ins = sum([["-i", str(a)] for a, _ in audios], [])
    filt = "".join(f"[{k}:a]adelay={int(d * 1000)}|{int(d * 1000)}[a{k}];" for k, (_, d) in enumerate(audios))
    filt += "".join(f"[a{k}]" for k in range(len(audios))) + f"amix=inputs={len(audios)}:normalize=0,apad,atrim=0:{total:.3f}[out]"
    subprocess.run([FFMPEG, "-y", *ins, "-filter_complex", filt, "-map", "[out]", "-ar", "48000", str(wav)],
                   check=True, capture_output=True)

    if muestras:  # un cuadro por escena, ya armada, para revisar el diseño sin codificar
        with sync_playwright() as pw:
            br = pw.chromium.launch(channel="chrome")
            pg = br.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg.goto(pagina.as_uri())
            pg.evaluate("document.fonts.ready")
            for k, eh in enumerate(escenas_html):
                t1 = float(re.search(r"--t1:([\d.]+)s", eh).group(1))
                pg.evaluate(f"seek({t1 - .6})")
                pg.screenshot(path=str(TMP / f"muestra-{k:02d}.png"))
            br.close()
        print(f"muestras en {TMP} ({total:.1f} s)")
        return

    out = ROOT / reel["mp4"]
    frames = int(total * FPS)
    enc = subprocess.Popen([FFMPEG, "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
                            "-i", str(wav), "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-color_range", "tv",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(out)],
                           stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome")
        pg = br.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        pg.goto(pagina.as_uri())
        pg.evaluate("document.fonts.ready")
        for f in range(frames):
            pg.evaluate(f"seek({f / FPS})")
            enc.stdin.write(pg.screenshot(type="jpeg", quality=93))
            if f % (FPS * 5) == 0:
                print(f"  {f / FPS:4.0f}/{total:.0f} s", flush=True)
        # Portada para el Reel: la escena elegida, ya armada.
        t_portada = float(re.findall(r"--t0:([\d.]+)s;--t1:([\d.]+)s", escenas_html[reel["escena_portada"]])[0][1]) - .6
        pg.evaluate(f"seek({t_portada}); document.querySelector('.caps').style.display = 'none'")  # sin subtítulo
        pg.screenshot(path=str(ROOT / reel["portada"]))
        br.close()
    enc.stdin.close()
    enc.wait()
    print(f"ok: {out.name} ({total:.1f} s, {frames} cuadros)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0] if args else "medilu-video", muestras="--muestras" in sys.argv)
