const axios = require('axios');
const cheerio = require('cheerio');

class QuinielaScraper {
  constructor() {
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    this.ordenTurnos = ['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'];
  }

  async obtenerPagina(url) {
    const response = await axios.get(url, {
      headers: this.headers,
      timeout: 12000
    });
    return cheerio.load(response.data);
  }

  _identificarTurno(texto) {
    const t = (texto || '').toLowerCase();
    if (t.includes('previa')) return 'Previa';
    if (t.includes('primera') || t.includes('el primero')) return 'Primera';
    if (t.includes('matutina')) return 'Matutina';
    if (t.includes('vespertina')) return 'Vespertina';
    if (t.includes('nocturna')) return 'Nocturna';
    return null;
  }

  // Parser universal de tablas (lee filas con pares posición/número de 1° a 20°)
  _parsePrimerosVeinte($, $contenedor) {
    const numeros = Array(20).fill('----');
    let cantidadCargados = 0;

    if (!$contenedor || $contenedor.length === 0) {
      return { tieneDatos: false, numeros };
    }

    const $filas = $contenedor.find('tr');
    if ($filas.length > 0) {
      $filas.each((i, fila) => {
        const $cells = $(fila).find('td, th');
        for (let j = 0; j < $cells.length - 1; j++) {
          const posText = $($cells[j]).text().trim().replace(/[^\d]/g, '');
          const pos = parseInt(posText, 10);

          if (!isNaN(pos) && pos >= 1 && pos <= 20 && numeros[pos - 1] === '----') {
            const numCell = $cells[j + 1];
            const boldText = $(numCell).find('b, strong').text().trim();
            const rawText = boldText || $(numCell).text().trim();
            const match = rawText.match(/\b(\d{3,4})\b/);

            if (match) {
              numeros[pos - 1] = match[1].padStart(4, '0');
              cantidadCargados++;
              j++; // avanzar al siguiente par
            }
          }
        }
      });
    }

    return {
      tieneDatos: cantidadCargados > 0 && numeros[0] !== '----',
      numeros
    };
  }

  // FUENTE 1: quinieleando.com.ar
  async _extraerDesdeQuinieleando(slug, sufijoUrl) {
    const porTurno = {
      Previa: null,
      Primera: null,
      Matutina: null,
      Vespertina: null,
      Nocturna: null
    };

    try {
      const url = `https://quinieleando.com.ar/quinielas/${slug}/${sufijoUrl}`;
      const $ = await this.obtenerPagina(url);

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
    } catch (error) {
      console.error(`[Quinieleando] Error en ${slug}/${sufijoUrl}:`, error.message);
    }

    return porTurno;
  }

  // FUENTE 2 (Respaldo en vivo cuando Quinieleando demora en publicar hoy): vivitusuerte.com
  async _extraerDesdeViviTuSuerte(slugVivi) {
    const porTurno = {
      Previa: null,
      Primera: null,
      Matutina: null,
      Vespertina: null,
      Nocturna: null
    };

    try {
      const url = `https://www.vivitusuerte.com/pizarra/${slugVivi}`;
      const $ = await this.obtenerPagina(url);

      $('table, .tabla-quiniela, .card, .panel, div').each((i, elem) => {
        const $elem = $(elem);
        if ($elem.find('table').length > 0 && !$elem.is('table')) return;

        const titulo =
          $elem.find('thead, th, h2, h3, h4, .titulo').first().text() ||
          $elem.prevAll('h2, h3, h4, div').first().text();

        const turno = this._identificarTurno(titulo);
        if (turno && !porTurno[turno]) {
          const { tieneDatos, numeros } = this._parsePrimerosVeinte($, $elem);
          if (tieneDatos) {
            porTurno[turno] = numeros;
          }
        }
      });
    } catch (error) {
      // Silencioso si no responde la fuente secundaria
    }

    return porTurno;
  }

  // FUENTE 3 (Segundo respaldo en vivo): notitimba.com
  async _extraerDesdeNotiTimba(slugNoti) {
    const porTurno = {
      Previa: null,
      Primera: null,
      Matutina: null,
      Vespertina: null,
      Nocturna: null
    };

    try {
      const url = `https://www.notitimba.com/lots/${slugNoti}`;
      const $ = await this.obtenerPagina(url);

      $('table').each((i, table) => {
        const $table = $(table);
        const titulo =
          $table.find('thead, th, caption').text() ||
          $table.prevAll('h2, h3, h4, div').first().text();

        const turno = this._identificarTurno(titulo);
        if (turno && !porTurno[turno]) {
          const { tieneDatos, numeros } = this._parsePrimerosVeinte($, $table);
          if (tieneDatos) {
            porTurno[turno] = numeros;
          }
        }
      });
    } catch (error) {
      // Silencioso si no responde la tercera fuente
    }

    return porTurno;
  }

  async _obtenerTurnosHoyCombinados(lot) {
    // 1. Consultar Quinieleando (resultados-de-hoy)
    const turnosQ = await this._extraerDesdeQuinieleando(lot.slugQ, 'resultados-de-hoy');

    // Verificar si Quinieleando devolvió algún sorteo hoy
    const tieneEnQ = Object.values(turnosQ).some(v => v !== null);
    if (tieneEnQ) {
      return turnosQ;
    }

    // 2. Si Quinieleando está vacío hoy, consultar fuentes secundarias en vivo
    const [turnosVivi, turnosNoti] = await Promise.all([
      this._extraerDesdeViviTuSuerte(lot.slugVivi),
      this._extraerDesdeNotiTimba(lot.slugNoti)
    ]);

    const combinados = { ...turnosQ };
    for (const t of this.ordenTurnos) {
      combinados[t] = turnosQ[t] || turnosVivi[t] || turnosNoti[t] || null;
    }

    return combinados;
  }

  async obtenerDatosPizarra() {
    const loteriasConfig = [
      { nombre: 'Nacional', slugQ: 'nacional', slugVivi: 'ciudad', slugNoti: 'nacional' },
      { nombre: 'Provincia', slugQ: 'buenosaires', slugVivi: 'provincia', slugNoti: 'provincia' },
      { nombre: 'Santa Fe', slugQ: 'santafe', slugVivi: 'santa-fe', slugNoti: 'santa-fe' }
    ];

    // 1. Buscar sorteos de HOY en todas las fuentes
    const resultadosHoy = await Promise.all(
      loteriasConfig.map(async lot => {
        const turnos = await this._obtenerTurnosHoyCombinados(lot);
        const detectados = Object.keys(turnos).filter(k => turnos[k] !== null);
        console.log(` -> [${lot.nombre} - HOY] Sorteos con números: ${detectados.join(', ') || 'ninguno'}`);
        return { loteria: lot.nombre, turnos };
      })
    );

    let turnoVigenteHoy = null;
    for (const turno of this.ordenTurnos) {
      if (resultadosHoy.some(r => r.turnos[turno] !== null)) {
        turnoVigenteHoy = turno;
      }
    }

    if (turnoVigenteHoy) {
      return {
        fecha: this.obtenerFechaArgentina(0),
        turnoVigente: turnoVigenteHoy,
        ultimaActualizacion: new Date().toISOString(),
        sorteos: resultadosHoy.map(r => ({
          nombre: turnoVigenteHoy,
          loteria: r.loteria,
          numeros: r.turnos[turnoVigenteHoy] || Array(20).fill('----')
        }))
      };
    }

    // 2. Si realmente aún no salió ningún sorteo hoy en ninguna fuente, mostrar Nocturna de AYER
    console.log('Sin sorteos publicados hoy todavía; usando respaldo de ayer...');
    const resultadosAyer = await Promise.all(
      loteriasConfig.map(async lot => ({
        loteria: lot.nombre,
        turnos: await this._extraerDesdeQuinieleando(lot.slugQ, 'resultados-de-ayer')
      }))
    );

    let turnoVigenteAyer = null;
    for (const turno of this.ordenTurnos) {
      if (resultadosAyer.some(r => r.turnos[turno] !== null)) {
        turnoVigenteAyer = turno;
      }
    }

    if (turnoVigenteAyer) {
      return {
        fecha: this.obtenerFechaArgentina(-1),
        turnoVigente: turnoVigenteAyer,
        ultimaActualizacion: new Date().toISOString(),
        sorteos: resultadosAyer.map(r => ({
          nombre: turnoVigenteAyer,
          loteria: r.loteria,
          numeros: r.turnos[turnoVigenteAyer] || Array(20).fill('----')
        }))
      };
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
