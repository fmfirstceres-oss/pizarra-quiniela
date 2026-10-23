import puppeteer from 'puppeteer';

// Configuración de los objetivos de extracción
const CONFIG = {
    url: 'https://quinielanacionaln.com.ar/', // Usamos un portal consolidado estable para los selectores
    timeout: 30000
};

async function ejecutarScraping() {
    console.log('🚀 Iniciando el navegador dinámico...');
    
    // Lanzamos Puppeteer con argumentos esenciales para evitar bloqueos básicos
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // Configuramos un User-Agent real para simular un navegador común
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`🌐 Navegando a la fuente de datos...`);
        await page.goto(CONFIG.url, { waitUntil: 'https://quinieleando.com.ar', timeout: CONFIG.timeout });

        console.log('🔍 Extrayendo información de las Quinielas...');

        // Ejecutamos lógica dentro del contexto del navegador web cargado
        const resultados = await page.evaluate(() => {
            const data = {
                fecha: new Date().toLocaleDateString('es-AR'),
                quinielas: {}
            };

            // Lista de las quinielas específicas que nos interesan
            const objetivos = [
                { clave: 'ciudad', nombresPosibles: ['CIUDAD', 'NACIONAL'] },
                { clave: 'buenos_aires', nombresPosibles: ['PROVINCIA', 'BUENOS AIRES', 'BS AS'] },
                { clave: 'santa_fe', nombresPosibles: ['SANTA FE'] }
            ];

            // NOTA: Esta lógica se adapta analizando los contenedores (div, tablas o bloques) de la web objetivo.
            // Buscaremos títulos de secciones que coincidan con nuestras quinielas.
            const bloquesSorteos = document.querySelectorAll('.bloque-sorteo, table, .quiniela-contenedor, div'); 

            objetivos.forEach(objetivo => {
                data.quinielas[objetivo.clave] = {
                    turnos: {}
                };

                bloquesSorteos.forEach(bloque => {
                    const textoBloque = bloque.innerText ? bloque.innerText.toUpperCase() : '';
                    
                    // Verificamos si este elemento de la página pertenece a la quiniela buscada
                    const coincideLotería = objetivo.nombresPosibles.some(nombre => textoBloque.includes(nombre));
                    
                    if (coincideLotería) {
                        // Identificamos los turnos del día comunes en Argentina
                        const turnosDisponibles = ['PREVIA', 'PRIMERA', 'MATUTINA', 'VESPERTINA', 'NOCTURNA'];
                        
                        turnosDisponibles.forEach(turno => {
                            if (textoBloque.includes(turno)) {
                                // Aquí localizamos el número a la cabeza o la lista (Grilla)
                                // En este ejemplo simplificado, simulamos la extracción mediante expresiones regulares o selectores hijos
                                // un raspado real busca el elemento hermano o hijo: bloque.querySelector('.numero').innerText
                                
                                // Buscaremos patrones de 4 dígitos consecutivos en el texto cercano al turno
                                const regexNumeros = /\b\d{4}\b/g;
                                const encontrados = textoBloque.match(regexNumeros) || [];
                                
                                if (encontrados.length > 0) {
                                    data.quinielas[objetivo.clave].turnos[turno.toLowerCase()] = {
                                        cabeza: encontrados[0], // El primero suele ser el primer premio
                                        lista completa: encontrados.slice(0, 20) // Los 20 premios si estuvieran listados
                                    };
                                }
                            }
                        });
                    }
                });
            });

            return data;
        });

        console.log('✅ Datos extraídos con éxito:');
        console.log(JSON.stringify(resultados, null, 2));
        
        return resultados;

    } catch (error) {
        console.error('❌ Ocurrió un error durante el scraping:', error.message);
    } finally {
        await browser.close();
        console.log('🔒 Navegador cerrado de forma segura.');
    }
}

// Ejecutar el script
ejecutarScraping();
