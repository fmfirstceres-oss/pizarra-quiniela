// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const scraper = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

let datosGlobales = {
  fecha: new Date().toLocaleDateString('es-AR'),
  turnoVigente: 'Previa',
  sorteos: []
};

async function actualizarExtractos() {
  try {
    console.log('Actualizando extractos de Quiniela (Santa Fe, Provincia, Nacional)...');
    const nuevosDatos = await scraper.obtenerDatosPizarra();
    if (nuevosDatos && nuevosDatos.sorteos.length > 0) {
      datosGlobales = nuevosDatos;
      console.log(`Sorteo vigente activo: ${datosGlobales.turnoVigente} (${datosGlobales.fecha})`);
    }
  } catch (error) {
    console.error('Error al actualizar extractos:', error.message);
  }
}

// Actualizar al iniciar y repetir automáticamente cada 2 minutos
actualizarExtractos();
setInterval(actualizarExtractos, 2 * 60 * 1000);

// Endpoint JSON para que la pizarra consulte cambios automáticamente en segundo plano
app.get('/api/datos', (req, res) => {
  res.json(datosGlobales);
});

// Ruta principal que inyecta datosGlobales dentro de public/index.html
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) {
      return res.status(500).send('Error cargando la pizarra');
    }
    const scriptInyeccion = `var datosGlobales = ${JSON.stringify(datosGlobales)};`;
    const htmlConDatos = html.replace('/*INYECCION_DE_DATOS*/', scriptInyeccion);
    res.send(htmlConDatos);
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Pizarra corriendo en puerto ${PORT}`);
});
