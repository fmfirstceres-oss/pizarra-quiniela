const axios = require('axios');
const cheerio = require('cheerio');

class QuinielaScraper {
  constructor() {
    this.baseUrl = 'https://quinieleando.com.ar';
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    this.ordenTurnos = ['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'];
  }

  async obtenerPagina(url) {
    const response = await axios.get(url, { headers: this.headers, timeout: 15000 });
    return cheerio.load(response.data);
  }

  // Extrae los 20 premios ordenados del 1° al 20° puesto
  _parsePrimerosVeinte($, $table) {
    const numeros = Array(20).fill('----');
    let tieneDatos = false;

    if (!$table || $table.length === 0) return { tieneDatos, numeros };

    $table.find('tbody tr').each((i, fila) => {
      const $cells = $(fila).find('td');
      for (let j = 0; j < $cells.length; j += 2) {
        const pos = parseInt($($cells[j]).text().trim(), 10);
        const numCell = $cells[j + 1];

        if (!isNaN(pos) && pos >= 1 && pos <= 20 && numCell) {
          const boldText = $(numCell).find('b').text().trim();
          const rawText = boldText || $(numCell).text().trim();
          const match = rawText.match(/\d{1,4}/);

          if (match) {
            numeros[pos - 1] = match[0].padStart(4, '0');
            tieneDatos = true;
          }
        }
      }
    });

    return { tieneDatos, numeros };
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

      $('table').each((i, table) => {
        const $table = $(table);
        const heading = $table.find('thead h3').text().toLowerCase();

        let turno = null;
        if (heading.includes('previa')) turno = 'Previa';
        else if (heading.includes('primera')) turno = 'Primera';
        else if (heading.includes('matutina')) turno = 'Matutina';
        else if (heading.includes('vespertina')) turno = 'Vespertina';
        else if (heading.includes('nocturna')) turno = 'Nocturna';

        if (turno) {
          const { tieneDatos, numeros } = this._parsePrimerosVeinte($, $table);
          if (tieneDatos) {
            porTurno[turno] = numeros;
          }
        }
      });
    } catch (error) {
      console.error(`Error al extraer ${pathUrl}:`, error.message);
    }

    return porTurno;
  }

  async _obtenerDatosDelDia(sufijoUrl, diasOffset = 0) {
    const loteriasConfig = [
      { nombre: 'Santa Fe', slug: 'santafe' },
      { nombre: 'Provincia', slug: 'buenosaires' },
      { nombre: 'Nacional', slug: 'nacional' }
    ];

    const resultadosLoterias = await Promise.all(
      loteriasConfig.map(async lot => ({
        loteria: lot.nombre,
        turnos: await this._extraerLoteriaPorUrl(`/quinielas/${lot.slug}/${sufijoUrl}`)
      }))
    );

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
      fecha: this.obtenerFecha(diasOffset),
      turnoVigente,
      sorteos
    };
  }

  async obtenerDatosPizarra() {
    const datosHoy = await this._obtenerDatosDelDia('resultados-de-hoy', 0);
    if (datosHoy) {
      return datosHoy;
    }

    const datosAyer = await this._obtenerDatosDelDia('resultados-de-ayer', -1);
    if (datosAyer) {
      return datosAyer;
    }

    return {
      fecha: this.obtenerFecha(0),
      turnoVigente: 'Previa',
      sorteos: [
        { nombre: 'Previa', loteria: 'Santa Fe', numeros: Array(20).fill('----') },
        { nombre: 'Previa', loteria: 'Provincia', numeros: Array(20).fill('----') },
        { nombre: 'Previa', loteria: 'Nacional', numeros: Array(20).fill('----') }
      ]
    };
  }

  obtenerFecha(diasOffset = 0) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + diasOffset);
    return fecha.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}

module.exports = new QuinielaScraper();
