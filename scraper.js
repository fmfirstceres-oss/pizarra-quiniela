const axios = require('axios');
const cheerio = require('cheerio');

class QuinielaScraper {
  constructor() {
    this.baseUrl = 'https://quinieleando.com.ar';
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Cache-Control': 'max-age=0'
    };
    this.ordenTurnos = ['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'];
  }

  async obtenerPagina(url) {
    // URL limpia sin parámetros extra para evitar bloqueos de Cloudflare
    const response = await axios.get(url, {
      headers: this.headers,
      timeout: 15000
    });
    return cheerio.load(response.data);
  }

  _parsePrimerosVeinte($, $table) {
    const numeros = Array(20).fill('----');
    let cantidadCargados = 0;

    if (!$table || $table.length === 0) return { tieneDatos: false, numeros };

    // Buscar filas tanto en tbody como directamente en tr
    const $filas = $table.find('tbody tr').length > 0
      ? $table.find('tbody tr')
      : $table.find('tr');

    $filas.each((i, fila) => {
      const $cells = $(fila).find('td');
      for (let j = 0; j < $cells.length; j += 2) {
        const posText = $($cells[j]).text().trim();
        const numCell = $cells[j + 1];
        const pos = parseInt(posText, 10);

        if (!isNaN(pos) && pos >= 1 && pos <= 20 && numCell) {
          const boldText = $(numCell).find('b').text().trim();
          const rawText = boldText || $(numCell).text().trim();
          // Solo aceptar números reales de 1 a 4 dígitos (ignorar guiones o vacíos)
          const match = rawText.match(/\d{1,4}/);

          if (match) {
            numeros[pos - 1] = match[0].padStart(4, '0');
            cantidadCargados++;
          }
        }
      }
    });

    // Consideramos válido el sorteo si al menos tiene la cabeza (pos 1) o algún número cargado
    return {
      tieneDatos: cantidadCargados > 0,
      numeros
    };
  }

  _identificarTurno(texto) {
    const t = (texto || '').toLowerCase();
    if (t.includes('previa')) return 'Previa';
    if (t.includes('primera')) return 'Primera';
    if (t.includes('matutina')) return 'Matutina';
    if (t.includes('vespertina')) return 'Vespertina';
    if (t.includes('nocturna')) return 'Nocturna';
    return null;
  }

  async _extraerLoteriaPorUrl(pathUrl) {
    const porTurno = {
      Previa: null,
      Primera: null,
      Matutina: null,
      Vespertina: null,
      Nocturna: null
    };

    try {
      const $ = await this.obtenerPagina(`${this.baseUrl}${pathUrl}`);

      // Método 1: Buscar dentro de cada tabla (thead, h3, th, caption o elemento previo)
      $('table').each((i, table) => {
        const $table = $(table);
        const textoEncabezado =
          $table.find('thead').text() ||
          $table.find('caption').text() ||
          $table.prevAll('h1, h2, h3, h4, div, p').first().text();

        const turno = this._identificarTurno(textoEncabezado);

        if (turno && !porTurno[turno]) {
          const { tieneDatos, numeros } = this._parsePrimerosVeinte($, $table);
          if (tieneDatos) {
            porTurno[turno] = numeros;
          }
        }
      });

      // Método 2 (Fallback): Si algún turno no se detectó por thead, buscar encabezados en la página
      for (const turnoNombre of this.ordenTurnos) {
        if (!porTurno[turnoNombre]) {
          const clave = turnoNombre.toLowerCase();
          const selectorHeading = $('h1, h2, h3, h4, th, thead').filter((i, el) => {
            const txt = $(el).text().toLowerCase();
            return txt.includes(clave);
          }).first();

          if (selectorHeading.length) {
            const $tablaCercana = selectorHeading.closest('table').length
              ? selectorHeading.closest('table')
              : selectorHeading.nextAll('table').first();

            if ($tablaCercana.length) {
              const { tieneDatos, numeros } = this._parsePrimerosVeinte($, $tablaCercana);
              if (tieneDatos) {
                porTurno[turnoNombre] = numeros;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error al extraer ${pathUrl}:`, error.message);
    }

    return porTurno;
  }

  async _obtenerDatosDelDia(sufijoUrl, diasOffset = 0) {
    const loteriasConfig = [
      { nombre: 'Nacional', slug: 'nacional' },
      { nombre: 'Provincia', slug: 'buenosaires' },
      { nombre: 'Santa Fe', slug: 'santafe' }
    ];

    // Intentar primero con /resultados-de-hoy y, si una ruta cambia, probar la raíz /quinielas/{slug}
    const resultadosLoterias = await Promise.all(
      loteriasConfig.map(async lot => {
        let turnos = await this._extraerLoteriaPorUrl(`/quinielas/${lot.slug}/${sufijoUrl}`);

        const tieneAlguno = Object.values(turnos).some(v => v !== null);
        if (!tieneAlguno && diasOffset === 0) {
          turnos = await this._extraerLoteriaPorUrl(`/quinielas/${lot.slug}`);
        }

        const turnosDetectados = Object.keys(turnos).filter(k => turnos[k] !== null);
        console.log(` -> [${lot.nombre} - ${sufijoUrl}] Sorteos con números: ${turnosDetectados.join(', ') || 'ninguno'}`);

        return {
          loteria: lot.nombre,
          turnos
        };
      })
    );

    // El turno vigente es el último en orden cronológico que tenga datos en al menos una lotería
    let turnoVigente = null;
    for (const turno of this.ordenTurnos) {
      const algunaTieneDatos = resultadosLoterias.some(
        r => r.turnos[turno] !== null
      );
      if (algunaTieneDatos) {
        turnoVigente = turno;
      }
    }

    if (!turnoVigente) {
      return null;
    }

    const sorteos = resultadosLoterias.map(r => ({
      nombre: turnoVigente,
      loteria: r.loteria,
      numeros: r.turnos[turnoVigente] || Array(20).fill('----')
    }));

    return {
      fecha: this.obtenerFechaArgentina(diasOffset),
      turnoVigente,
      ultimaActualizacion: new Date().toISOString(),
      sorteos
    };
  }

  async obtenerDatosPizarra() {
    const datosHoy = await this._obtenerDatosDelDia('resultados-de-hoy', 0);
    if (datosHoy) {
      return datosHoy;
    }

    console.log('Sin sorteos publicados hoy todavía; usando respaldo de ayer...');
    const datosAyer = await this._obtenerDatosDelDia('resultados-de-ayer', -1);
    if (datosAyer) {
      return datosAyer;
    }

    return null;
  }

  obtenerFechaArgentina(diasOffset = 0) {
    const ahoraAR = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    );
    ahoraAR.setDate(ahoraAR.getDate() + diasOffset);

    const dia = String(ahoraAR.getDate()).padStart(2, '0');
    const mes = String(ahoraAR.getMonth() + 1).padStart(2, '0');
    const anio = ahoraAR.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }
}

module.exports = new QuinielaScraper();
