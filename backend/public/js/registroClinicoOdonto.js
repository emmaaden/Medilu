function generarContrasena(longitud) {
    const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
    let contrasena = "";
    for (let i = 0; i < longitud; i++) {
        const indice = Math.floor(Math.random() * caracteres.length);
        contrasena += caracteres.charAt(indice);
    }
    return contrasena;
}

// Registrar paciente
async function addPacient() {
  const fullName = document.getElementById("nombre").value;
  const dni = document.getElementById("dni").value;
  const telefono = document.getElementById("telefono").value;
  const email = document.getElementById("email").value;
  const sexo = document.getElementById("sexo").value;
  const direccion = document.getElementById("direccion").value;

  // Se envía el valor crudo del input date (YYYY-MM-DD) para no correr el día por zona horaria.
  const fechaNacimiento = document.getElementById("fechaNacimiento").value;
  const edad = document.getElementById("edad").value;
  const obraSocial = document.getElementById("obraSocial").value;

  const sintomas = document.getElementById("sintomas").value;
  const diagnostico = document.getElementById("diagnostico").value;
  const tratamiento = document.getElementById("tratamiento").value;

  const fecha = new Date();
  const password = generarContrasena(8)
  const user = await fetch('/api/user');
  const userData = await user.json();
  const profesional = userData.fullName;

  // Obtener Area del prof
  const responseArea = await fetch('/auth/get-area', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: userData.email }),
  });
  const dataArea = await responseArea.json();

  if (!responseArea.ok) {
      console.error('Error:', dataArea.error);
      throw new Error('No se pudo obtener el área');
  }
  const area = dataArea.area;

  // Registrar Paciente
  const response = await fetch("/pacient/regis-pacient", {
      method: "POST",
      headers: {
          "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        dni,
        password,
        telefono,
        email,
        sexo,
        direccion,
        fechaNacimiento,
        edad,
        obraSocial,
        fecha,
        area,
        profesional,
        sintomas,
        diagnostico,
        tratamiento,
        dientes
      })
  });

  if (response.ok) {
    Swal.fire({
      title: "Paciente registrado con éxito",
      icon: "success",
      confirmButtonColor: "#3085d6",
      confirmButtonText: "Ok!"
      }).then((result) => {
        if (result.isConfirmed) {
          location.reload()
        }
      });
  } else {
    const errorData = await response.json();
    Swal.fire({
      icon: "error",
      title: "Oops...",
      text: `Paciente ya registrado: ${errorData.error}`,
      footer: '<a href="https://wa.me/2615930274">Ayuda</a>'
    });
    //alert(errorData.error || "Error en el registro.");
  }
};

function cargarEstadosDientes(dientes) {
    dientes.forEach(diente => {
        const tooth = document.getElementById(diente.numero);
        if (tooth) {
            // Cambiar el color del diente según el estado
            switch (diente.estado) {
                case "sano":
                    tooth.style.fill = "green";
                    break;
                case "caries":
                    tooth.style.fill = "red";
                    break;
                case "tratado":
                    tooth.style.fill = "blue";
                    break;
                case "falta":
                    tooth.style.fill = "grey";
                    break;
                default:
                    tooth.style.fill = "white"; // Estado desconocido
            }
        }
    });
}

// Buscar paciente
async function searchPaciente() {
  const dni = document.getElementById("dniBuscar").value;
  const password = document.getElementById("password").value;
  try {
    const response = await fetch('/pacient/get-data-pacient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dni })
    });

    if (!response.ok) {
      throw new Error('Error al obtener los datos del paciente');
    }
    const data = await response.json();

    document.getElementById('menu').style.display = 'none';
    document.getElementById('registrarPaciente').style.display = 'none';
    document.getElementById('buscarPaciente').style.display = 'none';
    document.getElementById('saveDataPacient').style.display = 'block';
    odontogramaJS();

    document.getElementById('nombrePaciente').innerText = data.fullName;
    document.getElementById('telefonoPaciente').innerText = data.telefono;
    document.getElementById('emailPaciente').innerText = data.email;
    document.getElementById('dniPaciente').innerText = data.dni;
    document.getElementById('sexoPaciente').innerHTML = data.sexo;
    document.getElementById('direcPaciente').innerHTML = data.direccion;
    document.getElementById('fechaNacimientoPaciente').innerHTML = data.fechaNacimiento;
    document.getElementById('edadPaciente').innerHTML = data.edad;
    document.getElementById('osPaciente').innerHTML = data.obraSocial;
    document.getElementById('fechaAperturaPaciente').innerHTML = data.fechaApertura;
    console.log(data.history[data.history.length-1].dientes);
    cargarEstadosDientes(data.history[data.history.length-1].dientes)

    // Cargar datos en ventana modal
    document.getElementById("namePaciente").innerText = data.fullName;
      const bodyModal = document.getElementById("bodyModal");

      // Limpiar el contenido previo
      bodyModal.innerHTML = '';

      // Renderizar el historial por fecha
      data.history.forEach((entry) => {
        bodyModal.innerHTML += `
                <div class="historial-entry">
                    <p><strong>Profesional:</strong> ${entry.profesional}</p>
                    <p><strong>Area:</strong> ${entry.area}</p>

                    <p><strong>Fecha:</strong> ${entry.fecha}hs</p>
                    <p><strong>Síntomas:</strong> ${entry.sintomas}</p>
                    <p><strong>Diagnóstico:</strong> ${entry.diagnostico}</p>
                    <p><strong>Tratamiento:</strong> ${entry.tratamiento}</p>
                    <hr>
                </div>
            `;
      });

  } catch (error) {
    Swal.fire({
      icon: "error",
    //  title: "Oops...",
      title: "Datos Incorrectos",
      text: "Asegurate de que el paciente este registrado",
      timer: 3000
    });
    console.error(error.message);
  }
}

// Guardar datos paciente
async function saveDataPaciente() {
  const dni = document.getElementById("dniPaciente").textContent;
  const sintomas = document.getElementById("save-sintomas").value;
  const diagnostico = document.getElementById("save-diagnostico").value;
  const tratamiento = document.getElementById("save-tratamiento").value;
  const fecha = new Date();

  const user = await fetch('/api/user');
  const userData = await user.json();
  const profesional = userData.fullName;

    // Obtener Area del prof
  const responseArea = await fetch('/auth/get-area', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: userData.email }),
  });
  const dataArea = await responseArea.json();

  if (!responseArea.ok) {
      console.error('Error:', dataArea.error);
      throw new Error('No se pudo obtener el área');
  }
  const area = dataArea.area;


  const response = await fetch("/pacient/save-data-pacient", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dni,
      area,
      profesional,
      sintomas,
      diagnostico,
      tratamiento,
      fecha,
      dientes,
    })
  });

  if (response.ok) {
    // Mostrar el modal de éxito
    Swal.fire({
      title: "Guardado con éxito",
      icon: "success",
      confirmButtonColor: "#3085d6",
      confirmButtonText: "Ok!"
      }).then((result) => {
        if (result.isConfirmed) {
          location.reload()
        }
      });
  } else {
    const errorData = await response.json();
    Swal.fire({
      icon: "error",
      title: "Oops...",
      text: `No Guardado: ${errorData.error}`,
      footer: '<a href="https://wa.me/2615930274">Ayuda</a>'
    });
    //alert(errorData.error || "Error al cargar los datos del paciente.");
  }
}

// Funcion de los buttons
document.addEventListener('DOMContentLoaded', async () => {

  document.getElementById('select-1').addEventListener('click', function () {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('registrarPaciente').style.display = 'none';
    document.getElementById('buscarPaciente').style.display = 'block';
  });

  document.getElementById('volver-bus').addEventListener('click', function () {
    document.getElementById('menu').style.display = 'block';
    document.getElementById('registrarPaciente').style.display = 'none';
    document.getElementById('buscarPaciente').style.display = 'none';
  });

  document.getElementById('select-2').addEventListener('click', function () {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('buscarPaciente').style.display = 'none';
    document.getElementById('registrarPaciente').style.display = 'block';
    odontogramaJS();
  });

  document.getElementById('volver-reg').addEventListener('click', function () {
    document.getElementById('menu').style.display = 'block';
    document.getElementById('registrarPaciente').style.display = 'none';
    document.getElementById('buscarPaciente').style.display = 'none';
  });

  document.getElementById('volver-his').addEventListener('click', function () {
    document.getElementById('menu').style.display = 'block';
    document.getElementById('saveDataPacient').style.display = 'none';
  });

});

// Download PDF
async function downloadPatientHistory() {
  const { jsPDF } = window.jspdf;
  const { svg2pdf } = window;

  const doc = new jsPDF();

  // Obtener datos del paciente del fetch
  const dni = document.getElementById("dniBuscar").value;
  const password = document.getElementById("password").value;

  let data;
  try {
    const response = await fetch('/pacient/get-data-pacient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dni })
    });

    if (!response.ok) {
      throw new Error('Error al obtener los datos del paciente');
    }
    data = await response.json(); // Aquí obtienes el JSON directamente
  } catch (error) {
    console.error("Error al obtener datos del paciente:", error);
    alert("No se pudo obtener el historial clínico del paciente.");
    return;
  }

  // Datos del paciente
  const {
    fullName = "N/A", telefono = "N/A", dni: pacienteDni = "N/A",
    email = "N/A", sexo = "N/A", fechaNacimiento = "N/A",
    edad = "N/A", direccion = "N/A", obraSocial = "N/A",
    fechaApertura = "N/A", history = []
  } = data;

  // Encabezado
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Medilu", 105, 20, null, null, "center");

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("Historial Clínico del Paciente", 105, 30, null, null, "center");

  // Línea de separación
  doc.setLineWidth(0.5);
  doc.line(10, 35, 200, 35);

  // Información del paciente
  let yPosition = 45;
  const patientInfo = [
    `Nombre: ${fullName}`,
    `Teléfono: ${telefono}`,
    `DNI: ${pacienteDni}`,
    `Email: ${email}`,
    `Sexo: ${sexo}`,
    `Fecha de Nacimiento: ${fechaNacimiento}`,
    `Edad: ${edad}`,
    `Dirección: ${direccion}`,
    `Obra Social: ${obraSocial}`,
    `Fecha de Apertura: ${fechaApertura}`
  ];

  patientInfo.forEach((info) => {
    doc.setFontSize(12);
    doc.text(info, 10, yPosition);
    yPosition += 10;
  });

  // Línea de separación para historial
  doc.line(10, yPosition, 200, yPosition);
  yPosition += 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Historial Médico", 10, yPosition);
  yPosition += 10;

  // Procesar historial médico
  history.forEach(entry => {
    const content = [
      `Profesional: ${entry.profesional}`,
      `Área: ${entry.area}`,
      `Fecha: ${entry.fecha}hs`,
      `Síntomas: ${entry.sintomas}`,
      `Diagnóstico: ${entry.diagnostico}`,
      `Tratamiento: ${entry.tratamiento}`
    ];
    content.forEach(line => {
      doc.setFontSize(12);
      doc.text(line, 10, yPosition);
      yPosition += 7;
    });
    doc.line(10, yPosition, 200, yPosition);
    yPosition += 10;
  });

  // Agregar el odontograma
  const odontogramaSVG = document.querySelector('#odontogramaSVG');
  if (odontogramaSVG) {
    const svgString = new XMLSerializer().serializeToString(odontogramaSVG);
    const svgElement = new Blob([svgString], { type: 'image/svg+xml' });

    // Renderizar SVG en PDF
    const x = 10, y = yPosition + 10, width = 180, height = 90; // Ajustar posición y tamaño
    svg2pdf(svgElement, doc, { x, y, width, height });
  }

  // Descargar el PDF
  doc.save(`Historial_${fullName}.pdf`);
}
