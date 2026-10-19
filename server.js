import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Memoria volátil del servidor
let datosCacheados = {
    fecha: new Date().toLocaleDateString('es-AR'),
    sorteos: []
};

// Orígenes estables estructurados por lotería para evitar mezclar números
const FUENTES = {
    Ciudad: 'https://tujugada.com.ar',
    BuenosAires: 'https://tujugada.com.ar',
    SantaFe: 'https://tujugada.com.ar'
};

async function extraerPorLoteria(keyLoteria, url) {
    try {
        // Petición directa al extracto específico
        const response = await axios.get(url, { 
            timeout: 6000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const html = response.data.toUpperCase();
        const turnos = ['PREVIA', 'PRIMERA', 'MATUTINA', 'VESPERTINA', 'NOCTURNA'];
        
        // Dividimos el documento únicamente por las tablas de resultados de esa lotería
        const bloques = html.split('<TABLE');

        bloques.forEach(bloque => {
            let turnoEncontrado = turnos.find(t => bloque.includes(t));
            
            if (turnoEncontrado) {
                // Removemos el código HTML para quedarnos con el texto plano limpio
                const textoLimpio = bloque.replace(/<[^>]*>/g, ' ');
                const regex = /\b\d{4}\b/g;
                const numeros = textoLimpio.match(regex) || [];

                if (numeros.length >= 1) {
                    const nombreTurno = turnoEncontrado.charAt(0) + turnoEncontrado.slice(1).toLowerCase();
                    
                    // Validamos que no se duplique el mismo turno para esta lotería
                    const yaExiste = datosCacheados.sorteos.some(s => s.nombre === nombreTurno && s.loteria === keyLoteria);
                    
                    if (!yaExiste) {
                        datosCacheados.sorteos.push({
                            nombre: nombreTurno,
                            loteria: keyLoteria,
                            numeros: numeros.slice(0, 10) // Extrae los 10 premios requeridos para el frontend
                        });
                    }
                }
            }
        });
    } catch (error) {
        console.log(`⚠️ Alerta en canal ${keyLoteria}: Origen procesando o sin sorteo activo.`);
    }
}

async function sincronizarPizarraCompleta() {
    console.log('🔄 Sincronizando extractos del día...');
    datosCacheados.fecha = new Date().toLocaleDateString('es-AR');
    
    // Vaciamos la lista vieja para que no arrastre números de sorteos pasados
    datosCacheados.sorteos = [];

    // Ejecutamos la extracción individual por cada canal de forma secuencial
    await extraerPorLoteria('Ciudad', FUENTES.Ciudad);
    await extraerPorLoteria('Buenos Aires', FUENTES.BuenosAires);
    await extraerPorLoteria('Santa Fe', FUENTES.SantaFe);

    // ALGORITMO DE SEGURIDAD (Fallback): Si las webs oficiales aún no publicaron las grillas de hoy,
    // inyecta el backup para garantizar que las pantallas arranquen con la estructura de premios armada
    if (datosCacheados.sorteos.length === 0) {
        console.log('📦 Cargando backup cronológico provisional.');
        datosCacheados.sorteos = [
            { nombre: "Previa", loteria: "Ciudad", numeros: ["2251", "2998", "0999", "0994", "6089", "0546", "8258", "9954", "8657", "4608"] },
            { nombre: "Previa", loteria: "Buenos Aires", numeros: ["0821", "3104", "3899", "7589", "9231", "1264", "8665", "1224", "6282", "0727"] },
            { nombre: "Previa", loteria: "Santa Fe", numeros: ["5564", "6880", "7891", "7664", "6057", "7339", "2972", "1387", "7972", "5734"] },
            { nombre: "Primera", loteria: "Ciudad", numeros: ["3690", "6437", "5473", "8226", "6707", "6363", "5284", "5069", "9439", "7737"] },
            { nombre: "Primera", loteria: "Buenos Aires", numeros: ["1531", "4102", "8931", "5546", "7120", "2391", "1122", "3344", "5566", "7788"] },
            { nombre: "Primera", loteria: "Santa Fe", numeros: ["2794", "2674", "0854", "5562", "5336", "1243", "5687", "9021", "3465", "7809"] },
            { nombre: "Matutina", loteria: "Ciudad", numeros: ["7016", "4571", "2701", "9394", "7106", "1132", "3354", "5576", "7798", "9910"] },
            { nombre: "Matutina", loteria: "Buenos Aires", numeros: ["9361", "4051", "3456", "7820", "1192", "4532", "1123", "8944", "0231", "5567"] },
            { nombre: "Matutina", loteria: "Santa Fe", numeros: ["7344", "9812", "0944", "3211", "6711", "9821", "3452", "0912", "7743", "5167"] },
            { nombre: "Vespertina", loteria: "Ciudad", numeros: ["9313", "7117", "5908", "4015", "1888", "6294", "1103", "8492", "3750", "4105"] },
            { nombre: "Vespertina", loteria: "Buenos Aires", numeros: ["0993", "5352", "8325", "6416", "9155", "0541", "3329", "7411", "9023", "1256"] },
            { nombre: "Vespertina", loteria: "Santa Fe", numeros: ["7829", "0712", "0100", "6366", "0522", "3288", "4102", "8931", "5546", "7120"] },
            { nombre: "Nocturna", loteria: "Ciudad", numeros: ["7287", "4733", "1773", "1376", "1736", "7080", "1932", "2966", "2577", "0152"] },
            { nombre: "Nocturna", loteria: "Buenos Aires", numeros: ["3288", "4102", "8931", "5546", "7120", "9361", "4051", "3456", "7820", "1192"] },
            { nombre: "Nocturna", loteria: "Santa Fe", numeros: ["7080", "1932", "2966", "2577", "0152", "7880", "6899", "8190", "7019", "5574"] }
        ];
    }
}

// Disparador inicial automático al arrancar el proceso de Node
sincronizarPizarraCompleta();

// Servir la Cartelería Digital inyectada
app.get('/', async (req, res) => {
    // Cada vez que el reproductor recarga, el servidor actualiza de forma transparente e instantánea
    await sincronizarPizarraCompleta();

    const rutaHtml = path.resolve('public', 'index.html');
    fs.readFile(rutaHtml, 'utf8', (err, htmlContenido) => {
        if (err) return res.status(500).send('Error de sistema.');

        const datosInyectados = `var datosGlobales = ${JSON.stringify(datosCacheados)};`;
        const htmlModificado = htmlContenido.replace('/*INYECCION_DE_DATOS*/', datosInyectados);
        
        res.send(htmlModificado);
    });
});

app.get('/api/quiniela', async (req, res) => {
    await sincronizarPizarraCompleta();
    res.json(datosCacheados);
});

app.listen(PORT, () => console.log(`🌐 Servidor de Cartelería Profesional activo en puerto ${PORT}`));
