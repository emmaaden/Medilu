// Nota: rutas relativas (mismo origen). Los turnos disponibles los calcula el
// servidor en /available-slots según el horario_profesional del profesional;
// el cliente solo los muestra. El calendarId para crear el turno lo publica
// select-prof.js en window.CALENDAR_ID.
document.getElementById('enviar').addEventListener('click', handleFormSubmit);
document.getElementById('appointmentDate').addEventListener('change', updateAvailableSlots);
document.getElementById('profName').addEventListener('change', updateAvailableSlots);

function handleFormSubmit(event) {
  try {
    event.preventDefault();

    const name = document.getElementById('patientName').value;
    const email = document.getElementById('email').value;
    const number = document.getElementById('number').value;
    const numberCode = document.getElementById('number-code').value;
    const selectedSlot = document.getElementById('available-slots').value;
    const date = new Date(selectedSlot);

    // El calendario lo resuelve el server a partir del profesional (no se envía).
    const profId = document.getElementById('profName').value;
    const clinica = new URLSearchParams(window.location.search).get('clinica') || undefined;
    if (!profId) {
      Swal.fire({
        icon: "warning",
        title: "Elegí un profesional",
        text: "Seleccioná un profesional antes de agendar el turno.",
      });
      return;
    }

    const now = new Date();

    // Verificar si la fecha seleccionada es anterior a la actual
    if (date < now) {
      Swal.fire({
        icon: "error",
        title: "Fecha inválida",
        text: "No puedes elegir una fecha pasada.",
      });
      return; // Detener el procesamiento del formulario
    }

    const eventDetails = {
        summary: `Cita con ${name}`,
        description: `Correo del paciente: ${email}, Numero de teléfono: ${number}`,
        start: {
            dateTime: date.toISOString(),
            timeZone: 'America/Argentina/Buenos_Aires'
        },
        end: {
            dateTime: new Date(date.getTime() + 30 * 60000).toISOString(), // Añadir 30 minutos a la hora de inicio
            timeZone: 'America/Argentina/Buenos_Aires'
        },
        email: email, // Añadir el correo del cliente
        number: number, // Añadir el número de teléfono del cliente
        numberCode: numberCode, // Añadir el area de país del teléfono del cliente
        profId: profId, // El server deriva el calendario del profesional
        clinica: clinica // Slug de la clínica (aislamiento por tenant)
    };

    fetch(`/create-event`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventDetails)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('appointmentDate').value = '';
                document.getElementById('available-slots').value = '';
                // Mostrar el modal de éxito
                Swal.fire({
                  title: "Turno Agendado con Éxito",
                  icon: "success",
                  confirmButtonColor: "#3085d6",
                  confirmButtonText: "Ok!"
                  }).then((result) => {
                    if (result.isConfirmed) {
                      location.reload()
                    }
                  });
            } else {
                // Mostrar el modal de error
                Swal.fire({
                  icon: "error",
                  title: "Oops...",
                  text: "Turno no agendado",
                  footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
                });
            }
        })
        .catch(error => {
            console.error('Error al enviar la solicitud:', error);
            // Mostrar el modal de error en caso de fallo
            // Mostrar el modal de error
            Swal.fire({
              icon: "error",
              title: "Oops...",
              text: `Turno no agendado: ${e.message}`,
              footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
            });
        });
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Oops...",
          text: `Turno no agendado: ${e.message}`,
          footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
        });
      }
}

// El servidor (/available-slots) ya devuelve las franjas LIBRES del profesional
// para la fecha, respetando su horario_profesional. El cliente solo las muestra.

function formatSlotLocal(iso) {
    return new Date(iso).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Mendoza',
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

// Busca hacia adelante (hasta 60 días) el primer día con turnos disponibles.
async function searchForNearestSlot(profId) {
    const nearestEl = document.getElementById('nearest-slot');
    const current = new Date();

    for (let i = 0; i < 60; i++) {
        const formattedDate = current.toISOString().split('T')[0]; // YYYY-MM-DD
        try {
            const resp = await fetch(`/available-slots?date=${encodeURIComponent(formattedDate)}&profId=${encodeURIComponent(profId)}`);
            const slots = await resp.json();
            if (Array.isArray(slots) && slots.length > 0) {
                slots.sort();
                nearestEl.textContent = `El turno más cercano es: ${formatSlotLocal(slots[0])}hs`;
                return;
            }
        } catch (error) {
            console.error('Error al buscar el turno más cercano:', error);
            return;
        }
        current.setDate(current.getDate() + 1);
    }
    nearestEl.textContent = 'No se encontraron turnos disponibles próximamente.';
}


async function updateAvailableSlots() {
    const selectedDate = document.getElementById('appointmentDate').value;
    const profId = document.getElementById('profName').value;
    const selectElement = document.getElementById('available-slots');
    const nearestEl = document.getElementById('nearest-slot');

    if (!selectedDate || !profId) {
        if (!profId) nearestEl.textContent = 'Seleccioná un profesional para ver los turnos.';
        return;
    }

    try {
        const resp = await fetch(`/available-slots?date=${encodeURIComponent(selectedDate)}&profId=${encodeURIComponent(profId)}`);
        const slots = await resp.json();

        selectElement.innerHTML = '<option value="">Selecciona un horario</option>';

        if (Array.isArray(slots) && slots.length > 0) {
            slots.sort();
            slots.forEach(slot => {
                const option = document.createElement('option');
                option.value = slot;                        // UTC para enviar al servidor
                option.textContent = formatSlotLocal(slot); // hora local
                selectElement.appendChild(option);
            });
            nearestEl.textContent = `El turno más cercano es: ${formatSlotLocal(slots[0])}hs`;
        } else {
            nearestEl.textContent = 'No hay turnos ese día. Buscando el más cercano...';
            searchForNearestSlot(profId);
        }
    } catch (error) {
        console.error('Error al obtener los horarios disponibles:', error);
        Swal.fire({
            icon: "error",
            title: "Oops...",
            text: `Error de sistema, le pedimos disculpas.`,
            footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
        });
    }
}


// Busca Turnos
document.getElementById('searchAppointmentForm').addEventListener('submit', function (event) {
    event.preventDefault();

    const email = document.getElementById('searchEmail').value;

    // Asegurarse de que el email no esté vacío
    if (!email) {
        alert('Por favor, introduce un correo electrónico para buscar los turnos.');
        return;
    }

    if (!window.CALENDAR_ID) {
        Swal.fire({
            icon: "warning",
            title: "Elegí un profesional",
            text: "Seleccioná el profesional para buscar tus turnos con él.",
        });
        return;
    }

    // Realizar la búsqueda con el email en el calendario del profesional elegido
    fetch(`/search-appointment?email=${encodeURIComponent(email)}&calendarId=${encodeURIComponent(window.CALENDAR_ID)}`)
        .then(response => response.json())
        .then(data => {
            const appointmentsDiv = document.getElementById('appointments');
            appointmentsDiv.innerHTML = '';

            if (data.length > 0) {
                data.forEach(appointment => {
                    const appointmentDiv = document.createElement('div');

                    // Tratar la fecha
                    const fecha = new Date(appointment.start.dateTime)
                    fecha.setHours(fecha.getHours() - 3);
                    const opciones = {
                        weekday: 'long', // día de la semana
                        year: 'numeric', // año
                        month: 'long', // mes completo
                        day: 'numeric', // día del mes
                        hour: '2-digit', // hora con 2 dígitos
                        minute: '2-digit', // minutos con 2 dígitos
                        hour12: true // formato 12 horas (AM/PM)
                    };
                    const fechaFormateada = fecha.toLocaleString('es-ES', opciones);
                    appointmentDiv.innerHTML = `
                    <div class="my-4 border-start border-primary pe-2">
                      <p class="d-inline ms-3 me-3">Turno: ${fechaFormateada}</p>
                      <button class="btn btn-danger text-white d-inline" onclick="deleteAppointment('${appointment.id}')"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                    `;
                    appointmentsDiv.appendChild(appointmentDiv);
                });
            } else {
                appointmentsDiv.innerHTML =
                    '<p class="mt-4">No se encontraron turnos disponibles.</p>' +
                    '<p class="mt-4">Recuerde que únicamente aparecerán los turnos solicitados a través de nuestro sistema. Si ha solicitado un turno de manera presencial, le recomendamos que se comunique directamente con el centro médico donde realizó la solicitud.</p>';
            }
        })
        .catch(error => {
            console.error('Error al buscar turnos:', error);
            Swal.fire({
                icon: "error",
                title: "Oops...",
                text: `Error de sistema, le pedimos disculpas.`,
                footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
              });
        });
});

function deleteAppointment(eventId) {
    fetch(`/delete-appointment/${eventId}?calendarId=${encodeURIComponent(window.CALENDAR_ID || '')}`, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
          Swal.fire({
          title: "Turno eliminado con éxito",
          icon: "success",
          confirmButtonColor: "#3085d6",
          confirmButtonText: "Ok!"
          }).then((result) => {
            if (result.isConfirmed) {
              location.reload()
            }
          });
        })
        .catch(error => {
            console.error('Error al eliminar turno:', error);
            Swal.fire({
                icon: "error",
                title: "Oops...",
                text: `Error de sistema, le pedimos disculpas.`,
                footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
              });
        });
}
