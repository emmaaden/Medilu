// Plantilla HTML de los mails que manda el backend, con el mismo diseño que los de
// Supabase (backend/emails/supabase/*.html): logo, tarjeta blanca y pie de Medilu.
//
// HTML de mail: tablas y estilos inline (Gmail/Outlook ignoran <style> y CSS moderno).
// Todo lo dinámico se escapa con `esc` antes de entrar a la plantilla.

const FUENTE = "Geist,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
    fondo: '#f4f6f9',
    borde: '#dde3ea',
    texto: '#131e2b',
    cuerpo: '#3d4b5c',
    suave: '#66758a',
    pie: '#8a96a6',
    marca: '#1d5caa',
    acento: '#00a29e',
};

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

const LOGO = `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="vertical-align:middle;padding-right:8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="10" height="10" style="width:10px;height:10px;background-color:${C.marca};border-radius:4px 2px 2px 2px;font-size:0;line-height:0;">&nbsp;</td>
          <td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>
          <td width="10" height="10" style="width:10px;height:10px;background-color:${C.acento};border-radius:5px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr><td colspan="3" height="3" style="height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td width="10" height="10" style="width:10px;height:10px;background-color:${C.marca};border-radius:2px 2px 2px 4px;font-size:0;line-height:0;">&nbsp;</td>
          <td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>
          <td width="10" height="10" style="width:10px;height:10px;background-color:${C.marca};border-radius:2px 2px 4px 2px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
    <td style="vertical-align:middle;font-family:${FUENTE};font-size:22px;font-weight:600;letter-spacing:-0.3px;color:${C.texto};">Medi<span style="color:${C.marca};">lu</span></td>
  </tr>
</table>`;

// --- Bloques (devuelven HTML; el texto que reciben YA tiene que venir escapado) ---

function parrafo(html) {
    return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${C.cuerpo};">${html}</p>`;
}

function fuerte(texto) {
    return `<strong style="color:${C.texto};">${esc(texto)}</strong>`;
}

function link(href, texto) {
    return `<a href="${esc(href)}" style="color:${C.marca};text-decoration:underline;">${esc(texto)}</a>`;
}

function boton(href, texto) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;">
  <tr>
    <td align="center" style="background-color:${C.marca};border-radius:10px;">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(texto)}</a>
    </td>
  </tr>
</table>`;
}

// Caja gris con pares etiqueta/valor (p. ej. los datos de acceso).
// filas: [{ etiqueta, valor, mono? }]
function datos(filas) {
    const tr = filas.map((f, i) => `<tr>
    <td style="padding:${i ? '12px' : '0'} 0 0 0;">
      <p style="margin:0;font-size:12px;line-height:1.4;color:${C.suave};text-transform:uppercase;letter-spacing:0.4px;">${esc(f.etiqueta)}</p>
      <p style="margin:2px 0 0 0;font-size:${f.mono ? '18px' : '15px'};line-height:1.4;font-weight:600;color:${C.texto};word-break:break-all;${f.mono ? "font-family:'Geist Mono',SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.5px;" : ''}">${esc(f.valor)}</p>
    </td>
  </tr>`).join('\n');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;background-color:${C.fondo};border:1px solid ${C.borde};border-radius:10px;">
  <tr><td style="padding:16px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${tr}
    </table>
  </td></tr>
</table>`;
}

// Recuadro destacado con borde de color a la izquierda (un paso a seguir).
function aviso(titulo, html) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px 0;">
  <tr>
    <td style="border-left:3px solid ${C.acento};padding:2px 0 2px 14px;">
      <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;line-height:1.5;color:${C.texto};">${esc(titulo)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${C.cuerpo};">${html}</p>
    </td>
  </tr>
</table>`;
}

// Separador + texto chico al final de la tarjeta.
function nota(html) {
    return `<hr style="border:none;border-top:1px solid ${C.borde};margin:28px 0 20px 0;">
<p style="margin:0;font-size:13px;line-height:1.6;color:${C.suave};">${html}</p>`;
}

/**
 * Mail completo. `cuerpo` es HTML armado con los bloques de arriba.
 * `resumen` es el texto que los clientes de correo muestran como vista previa.
 */
function layoutMail({ titulo, resumen, cuerpo }) {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(titulo)} — Medilu</title>
</head>
<body style="margin:0;padding:0;background-color:${C.fondo};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(resumen || titulo)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.fondo};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;">
          <tr><td style="padding:0 4px 20px 4px;">${LOGO}</td></tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid ${C.borde};border-radius:12px;padding:36px 32px;font-family:${FUENTE};color:${C.texto};">
              <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:${C.texto};">${esc(titulo)}</h1>
${cuerpo}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0 4px;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.pie};">
              Medilu · Turnos e historia clínica, simple.<br>
              Este es un mensaje automático, no hace falta que lo respondas.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { layoutMail, parrafo, fuerte, link, boton, datos, aviso, nota, esc };
