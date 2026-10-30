const express = require('express');
const fs = require('fs');
const path = require('path');
const scraper = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

let datosGlobales = {
  fecha: scraper.obtenerFechaArgentina(0),
  turnoVigente: 'Previa',
  ultimaActualizacion: null,
  sorteos: [
    { nombre: 'Previa', loteria: 'Santa Fe', numeros: Array(20).fill('----') },
    { nombre: 'Previa', loteria: 'Provincia', numeros: Array(20).fill('----') },
    { nombre: 'Previa', loteria: 'Nacional', numeros: Array(20).fill('----') }
  ]
};

let actualizando = false;
let ultimoChequeoMs = 0;

async function actualizarExtractos() {
  if (actualizando) return;
  actualizando = true;
  try {
    const nuevosDatos = await scraper.obtenerDatosPizarra();
    if (nuevosDatos && nuevosDatos.sorteos && nuevosDatos.sorteos.length > 0) {
      datosGlobales = nuevosDatos;
      ultimoChequeoMs = Date.now();
      console.log(
        `[${new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}] ` +
        `Sorteo activo: ${datosGlobales.turnoVigente} (${datosGlobales.fecha})`
      );
    }
  } catch (error) {
    console.error('Error al actualizar extractos:', error.message);
  } finally {
    actualizando = false;
  }
}

// Actualizar al iniciar y cada 1 minuto
actualizarExtractos();
setInterval(actualizarExtractos, 60 * 1000);

// Cabeceras para prohibir que el navegador o Render guarden caché
function sinCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

app.get('/api/datos', async (req, res) => {
  sinCache(res);
  // Si pasaron más de 60 segundos desde el último chequeo, actualizar ahora mismo
  if (Date.now() - ultimoChequeoMs > 60 * 1000) {
    await actualizarExtractos();
  }
  res.json(datosGlobales);
});

app.get('/', async (req, res) => {
  sinCache(res);
  if (Date.now() - ultimoChequeoMs > 60 * 1000) {
    await actualizarExtractos();
  }
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

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
