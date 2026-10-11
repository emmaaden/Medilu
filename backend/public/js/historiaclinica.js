document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('volver').addEventListener('click', function() {
    location.reload();
  });
});

// Buscar paciente
async function searchPaciente() {
    const dni = document.getElementById("indni").value;
    const password = document.getElementById("passwd").value;
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

      document.getElementById('windowsHistoriaClinica').style.display = 'block';
      document.getElementById('windowSearchHC').style.display = 'none';

      document.getElementById('nombrePaciente').innerText = data.fullName;
      document.getElementById('telefonoPaciente').innerText = data.telefono;
      document.getElementById('emailPaciente').innerText = data.email;
      document.getElementById('dniPaciente').innerText = data.dni;
      document.getElementById('direccionPaciente').innerText = data.direccion;
      document.getElementById('fechaNacimiento').innerText = data.fechaNacimiento;
      document.getElementById('edadPaciente').innerText = data.edad;
      document.getElementById('obraSocialPaciente').innerText = data.obraSocial;
      document.getElementById('sexoPaciente').innerText = data.sexo;
      document.getElementById('fechaAperturaPaciente').innerText = data.fechaApertura;



      const info = document.getElementById("info");

      // Limpiar el contenido previo
      info.innerHTML = '';

      // Renderizar el historial por fecha
      data.history.forEach((entry) => {
        info.innerHTML += `

          <div class="container">
            <div class="historial-entry p-4 border rounded shadow">
            <div class="row border rounded-top">
              <div class="col border-end text-start p-2">
                <p class="text-secondary-emphasis"><strong class="text-azul">Profesional:</strong> ${entry.profesional}</p>
              </div>
              <div class="col text-start p-2">
                <p class="text-secondary-emphasis"><strong class="text-azul">Area:</strong> ${entry.area}</p>
              </div>
            </div>

            <div class="row border border-top-0 p-2">
              <p class="text-secondary-emphasis"><strong class="text-azul">Fecha:</strong> ${entry.fecha}hs</p>
            </div>

            <div class="row border border-top-0 p-2">
              <p class="text-secondary-emphasis"><strong class="text-azul">Síntomas:</strong> ${entry.sintomas}</p>
            </div>
            <div class="row border border-top-0 p-2">
              <p class="text-secondary-emphasis"><strong class="text-azul">Diagnóstico:</strong> ${entry.diagnostico}</p>
            </div>
            <div class="row border border-top-0 p-2">
              <p class="text-secondary-emphasis"><strong class="text-azul">Tratamiento:</strong> ${entry.tratamiento}</p>
            </div>
            </div>
          </div></br>
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


  // Download PDF
  async function downloadPatientHistory() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Obtener datos del paciente del fetch
    const dni = document.getElementById("indni").value;
    const password = document.getElementById("passwd").value;

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
