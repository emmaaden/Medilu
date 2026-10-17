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
    body: JSON.stringify({ fullName, dni, password, telefono, email, sexo, direccion, fechaNacimiento, edad, obraSocial, area, profesional, sintomas, diagnostico, tratamiento, fecha })
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
      footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
    });
    //alert(errorData.error || "Error en el registro.");
  }
};

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
    body: JSON.stringify({ dni, area, profesional, sintomas, diagnostico, tratamiento, fecha })
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
      footer: '<a href="https://wa.me/2617725639">Ayuda</a>'
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

  // Información del paciente en dos columnas
  const patientInfoLeft = [
    { label: "Nombre", value: fullName },
    { label: "Teléfono", value: telefono },
    { label: "DNI", value: pacienteDni },
    { label: "Email", value: email },
    { label: "Sexo", value: sexo }
  ];

  const patientInfoRight = [
    { label: "Fecha de Nacimiento", value: fechaNacimiento },
    { label: "Edad", value: edad },
    { label: "Dirección", value: direccion },
    { label: "Obra Social", value: obraSocial },
    { label: "Fecha de Apertura", value: fechaApertura }
  ];

  // Coordenadas iniciales
  let yPositionLeft = 45; // Para la columna izquierda
  let yPositionRight = 45; // Para la columna derecha
  const leftX = 10; // Posición X para la columna izquierda
  const rightX = 105; // Posición X para la columna derecha

  // Renderizar columna izquierda
  patientInfoLeft.forEach(info => {
    if (yPositionLeft > 280) {
      doc.addPage();
      yPositionLeft = 20;
      yPositionRight = 20; // Reinicia ambas columnas
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${info.label}:`, leftX, yPositionLeft);
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text(info.value, leftX + 25, yPositionLeft);
    yPositionLeft += 10;
  });

  // Renderizar columna derecha
  patientInfoRight.forEach(info => {
    if (yPositionRight > 280) {
      doc.addPage();
      yPositionLeft = 20;
      yPositionRight = 20; // Reinicia ambas columnas
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${info.label}:`, rightX, yPositionRight);
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text(info.value, rightX + 55, yPositionRight);
    yPositionRight += 10;
  });

  // Línea de separación entre los datos del paciente y el historial
  const lineY = Math.max(yPositionLeft, yPositionRight) + 10; // Línea debajo del contenido mayor
  doc.line(10, lineY, 200, lineY);

  // Historial médico
  let yPosition = lineY + 10; // Ajustar la posición de inicio para el historial
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Historial Médico", 10, yPosition);
  yPosition += 10;

  // Procesar historial médico
  const pageHeight = doc.internal.pageSize.height; // Altura de la página
  const margin = 10;
  const maxHeight = pageHeight - margin;

  history.forEach(entry => {
    const content = [
      `Profesional: ${entry.profesional}`,
      `Área: ${entry.area}`,
      `Fecha: ${entry.fecha}hs`,
    ];

    const sintomas = doc.splitTextToSize(`Síntomas: ${entry.sintomas}`, 180);
    const diagnostico = doc.splitTextToSize(`Diagnóstico: ${entry.diagnostico}`, 180);
    const tratamiento = doc.splitTextToSize(`Tratamiento: ${entry.tratamiento}`, 180);

    const allContent = [...content, '', ...sintomas, '', ...diagnostico, '', ...tratamiento];

    allContent.forEach(line => {
      if (yPosition > maxHeight) {
        doc.addPage();
        yPosition = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(line, 10, yPosition);
      yPosition += 7;
    });

    if (yPosition > maxHeight) {
      doc.addPage();
      yPosition = 20;
    }
    doc.line(10, yPosition, 200, yPosition);
    yPosition += 10;
  });

  if (yPosition > maxHeight) {
    doc.addPage();
    yPosition = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Fin del historial clinico", 10, yPosition + 5);

  // Descargar el PDF
  doc.save(`Historial_${fullName}.pdf`);
}
