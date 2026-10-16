// Mails de turnos al paciente (confirmación, reprogramación, cancelación y recordatorio).
// Arma { subject, text, html } con la plantilla de Medilu; el envío lo hace quien llama.
//
// Gestión del turno:
//   manageToken          -> botón al enlace personal (/gestionar-turno?token=...), para invitados.
//   misTurnos: 'boton'   -> botón a "Mis turnos" (el paciente reservó con su cuenta).
//   misTurnos: 'link'    -> el turno es de una ficha que puede o no tener cuenta: solo se
//                           menciona "Mis turnos" como link, sin botón.

const { layoutMail, parrafo, fuerte, link, boton, datos, nota, esc } = require('./emailLayout');

const TZ = 'America/Argentina/Buenos_Aires';

function fechaHora(iso) {
    const d = new Date(iso);
    const fecha = d.toLocaleDateString('es-AR', { timeZone: TZ, dateStyle: 'full' });
    // 24 h explícito: según la versión de ICU, es-AR puede salir como "10:30 a. m.".
    const hora = d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return {
        completa: `${fecha} a las ${hora}`,
        fecha: fecha.charAt(0).toUpperCase() + fecha.slice(1),
        hora: `${hora} hs`,
    };
}

const TIPOS = {
    confirmacion: {
        asunto: 'Confirmación de tu turno - Medilu',
        titulo: 'Tu turno está confirmado',
        texto: (t, f) => `Tu turno${t} quedó agendado para el ${f} hs.`,
        html: 'tu turno quedó <strong>agendado</strong>. Estos son los datos:',
    },
    reprogramacion: {
        asunto: 'Tu turno fue reprogramado - Medilu',
        titulo: 'Tu turno cambió de horario',
        texto: (t, f) => `Tu turno${t} fue reprogramado para el ${f} hs.`,
        html: 'tu turno fue <strong>reprogramado</strong>. Estos son los datos nuevos:',
    },
    cancelacion: {
        asunto: 'Tu turno fue cancelado - Medilu',
        titulo: 'Tu turno fue cancelado',
        texto: (t, f) => `Tu turno${t} del ${f} hs fue cancelado.`,
        html: 'te avisamos que este turno fue <strong>cancelado</strong>:',
    },
    recordatorio: {
        asunto: 'Recordatorio de tu turno - Medilu',
        titulo: 'Se acerca tu turno',
        texto: (t, f) => `Te recordamos tu turno${t} para el ${f} hs.`,
        html: 'te recordamos tu próximo turno:',
    },
};

function mailTurno({ tipo, nombre, inicio, profesional, especialidad, baseUrl, manageToken, misTurnos }) {
    const cfg = TIPOS[tipo];
    const f = fechaHora(inicio);
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const hola = nombre ? `Hola ${nombre},` : 'Hola,';
    const con = `${profesional ? ` con ${profesional}` : ''}${especialidad ? ` (${especialidad})` : ''}`;
    const cancelado = tipo === 'cancelacion';

    const gestionUrl = manageToken ? `${base}/gestionar-turno?token=${encodeURIComponent(manageToken)}` : '';
    // Sin URL base (APP_URL sin configurar) no se arma el link a Mis turnos.
    if (!base) misTurnos = null;
    const misTurnosUrl = `${base}/mis-turnos`;

    // --- Texto plano ---
    let gestionText = '';
    if (!cancelado && gestionUrl) gestionText = `Para ver o cancelar este turno: ${gestionUrl}`;
    else if (!cancelado && misTurnos === 'boton') gestionText = `Ver o cancelar tus turnos: ${misTurnosUrl}`;
    else if (!cancelado && misTurnos === 'link') gestionText = `Si tenés cuenta en Medilu, lo ves en Mis turnos: ${misTurnosUrl}`;

    const text = [hola, cfg.texto(con, f.completa), gestionText, 'Medilu.'].filter(Boolean).join('\n\n');

    // --- HTML ---
    const filas = [
        { etiqueta: 'Fecha', valor: f.fecha },
        { etiqueta: 'Hora', valor: f.hora },
    ];
    if (profesional) filas.push({ etiqueta: 'Profesional', valor: profesional });
    if (especialidad) filas.push({ etiqueta: 'Especialidad', valor: especialidad });

    const cuerpo = [parrafo(`${esc(hola)} ${cfg.html}`), datos(filas)];
    if (cancelado) {
        cuerpo.push(nota('Si querés sacar un turno nuevo, comunicate con el lugar de atención o reservalo online.'));
    } else if (gestionUrl) {
        cuerpo.push(boton(gestionUrl, 'Ver o cancelar mi turno'));
        cuerpo.push(nota('Guardá este email: el botón es personal y te deja ver o cancelar el turno sin crear una cuenta. Si no podés ir, cancelalo así el horario queda libre para otra persona.'));
    } else if (misTurnos === 'boton') {
        cuerpo.push(boton(misTurnosUrl, 'Ir a Mis turnos'));
        cuerpo.push(nota(`Si no podés ir, cancelalo desde ${fuerte('Mis turnos')} así el horario queda libre para otra persona.`));
    } else if (misTurnos === 'link') {
        cuerpo.push(nota(`Si tenés cuenta en Medilu, también lo ves en ${link(misTurnosUrl, 'Mis turnos')}. Si no podés ir, avisá con anticipación así el horario queda libre para otra persona.`));
    } else {
        cuerpo.push(nota('Si no podés ir, avisá con anticipación así el horario queda libre para otra persona.'));
    }

    const resumen = `${cancelado ? 'Turno cancelado' : 'Turno'}: ${f.fecha}, ${f.hora}${profesional ? ` con ${profesional}` : ''}.`;

    return {
        subject: cfg.asunto,
        text,
        html: layoutMail({ titulo: cfg.titulo, resumen, cuerpo: cuerpo.join('\n') }),
    };
}

module.exports = { mailTurno };
