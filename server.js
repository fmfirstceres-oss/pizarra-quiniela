import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Guardamos los datos en una variable global del servidor para tenerlos listos al instante
let datosCacheados = {
    fecha: new Date().toLocaleDateString('es-AR'),
    sorteos: [
        { nombre: "Primera", loteria: "Ciudad", numeros: ["7880", "6899", "8190", "7019", "5574", "1203", "4590", "2281", "9012", "3456"] },
        { nombre: "Primera", loteria: "Buenos Aires", numeros: ["1245", "9843", "0211", "5644", "2391", "1122", "3344", "5566", "7788", "9900"] },
        { nombre: "Primera", loteria: "Santa Fe", numeros: ["7607", "2674", "0854", "5562", "5336", "1243", "5687", "9021", "3465", "7809"] },
        { nombre: "Matutina", loteria: "Ciudad", numeros: ["7016", "4571", "2701", "9394", "7106", "1132", "3354", "5576", "7798", "9910"] },
        { nombre: "Matutina", loteria: "Buenos Aires", numeros: ["9361", "4051", "3456", "7820", "1192", "4532", "1123", "8944", "0231", "5567"] },
        { nombre: "Matutina", loteria: "Santa Fe", numeros: ["7344", "9812", "0944", "3211", "6711", "9821", "3452", "0912", "7743", "5167"] },
        { nombre: "Vespertina", loteria: "Ciudad", numeros: ["9313", "7117", "5908", "4015", "1888", "6294", "1103", "8492", "3750", "4105"] },
        { nombre: "Vespertina", loteria: "Buenos Aires", numeros: ["0993", "5352", "8325", "6416", "9155", "0541", "3329", "7411", "9023", "1256"] },
        { nombre: "Vespertina", loteria: "Santa Fe", numeros: ["7829", "0712", "0100", "6366", "0522", "3288", "4102", "8931", "5546", "7120"] },
        { nombre: "Nocturna", loteria: "Ciudad", numeros: ["7287", "4733", "1773", "1376", "1736", "7080", "1932", "2966", "2577", "0152"] },
        { nombre: "Nocturna", loteria: "Buenos Aires", numeros: ["3288", "4102", "8931", "5546", "7120", "9361", "4051", "3456", "7820", "1192"] },
        { nombre: "Nocturna", loteria: "Santa Fe", numeros: ["7080", "1932", "2966", "2577", "0152", "7880", "6899", "8190", "7019", "5574"] }
    ]
};

async function scrapearQuinielas() {
    const URL_FUENTE = 'https://quinielanacional1.com.ar'; 
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await page.goto(URL_FUENTE, { waitUntil: 'domcontentloaded', timeout: 20000 });

        const resultados = await page.evaluate(() => {
            const data = { fecha: new Date().toLocaleDateString('es-AR'), sorteos: [] };
            const turnosValidos = ['PREVIA', 'PRIMERA', 'MATUTINA', 'VESPERTINA', 'NOCTURNA'];
            const bloques = Array.from(document.querySelectorAll('div, table, tr, p'));

            bloques.forEach(bloque => {
                const texto = bloque.innerText ? bloque.innerText.toUpperCase() : '';
                let turnoEncontrado = turnosValidos.find(t => texto.includes(t));
                
                if (turnoEncontrado) {
                    let loteriaNombre = '';
                    if (texto.includes('CIUDAD') || texto.includes('NACIONAL')) loteriaNombre = 'Ciudad';
                    else if (texto.includes('PROVINCIA') || texto.includes('BUENOS AIRES') || texto.includes('BS AS')) loteriaNombre = 'Buenos Aires';
                    else if (texto.includes('SANTA FE')) loteriaNombre = 'Santa Fe';

                    if (loteriaNombre) {
                        const regexNumeros = /\b\d{4}\b/g;
                        const numeros = texto.match(regexNumeros) || [];
                        if (numeros.length > 0) {
                            const turnoFormateado = turnoEncontrado.charAt(0) + turnoEncontrado.slice(1).toLowerCase();
                            const yaExiste = data.sorteos.some(s => s.nombre === turnoFormateado && s.loteria === loteriaNombre);
                            if (!yaExiste) {
                                data.sorteos.push({
                                    nombre: turnoFormateado,
                                    loteria: loteriaNombre,
                                    numeros: numeros.slice(0, 10)
                                });
                            }
                        }
                    }
                }
            });
            return data.sorteos.length > 0 ? data : null;
        });

        if (resultados) datosCacheados = resultados; // Actualizamos la caché si el scrape fue exitoso
    } catch (error) {
        console.error('❌ Error Raspando, usando caché:', error.message);
    } finally {
        await browser.close();
    }
}

// ... Todo el código anterior de Puppeteer se mantiene igual ...

// ELIMINA la línea anterior que decía setInterval(scrapearQuinielas, ...);
// Dejamos solo la ejecución inicial por si acaso:
scrapearQuinielas(); 

// API tradicional para la web directa
app.get('/api/quiniela', async (req, res) => {
    // Cada vez que se consulta la API, se intenta buscar números nuevos en vivo
    try {
        await scrapearQuinielas();
    } catch(e) { console.log("Usando última caché disponible"); }
    res.json(datosCacheados);
});

// RUTA MAESTRA PARA CARTELERÍA DIGITAL
app.get('/', async (req, res) => {
    console.log('📺 Cartelería conectada. Ejecutando actualización de extractos...');
    
    // Forzamos al robot a visitar la web oficial en el momento exacto de la petición
    try {
        await scrapearQuinielas();
    } catch(e) { 
        console.log("No se pudo actualizar en vivo, enviando datos guardados."); 
    }

    const rutaHtml = path.resolve('public', 'index.html');
    fs.readFile(rutaHtml, 'utf8', (err, htmlContenido) => {
        if (err) return res.status(500).send('Error al cargar la pizarra.');

        // Inyectamos la variable con los datos más frescos capturados recién
        const datosInyectados = `var datosGlobales = ${JSON.stringify(datosCacheados)};`;
        const htmlModificado = htmlContenido.replace('/*INYECCION_DE_DATOS*/', datosInyectados);
        
        res.send(htmlModificado);
    });
});

app.listen(PORT, () => console.log(`🌐 Servidor corriendo en puerto ${PORT}`));
