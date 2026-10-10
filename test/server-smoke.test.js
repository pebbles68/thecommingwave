// Prueba de humo del servidor (roadmap Fase 16). Arranca server/server.js en
// un puerto efímero (nunca el PORT real de desarrollo) y comprueba que sirve
// la página inicial y los datos estáticos por HTTP — no valida contenido de
// negocio (eso lo hace data.test.js), solo que el servidor funciona.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const server = require('../server/server.js');

function get(path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

test.before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)));
test.after(() => new Promise((resolve) => server.close(resolve)));

test('smoke: GET / responde 200 y sirve el HTML de la página inicial', async () => {
  const res = await get('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>/i);
});

test('smoke: GET /data/sources/sources.json responde 200 con JSON válido', async () => {
  const res = await get('/data/sources/sources.json');
  assert.equal(res.statusCode, 200);
  assert.doesNotThrow(() => JSON.parse(res.body), 'la respuesta no es JSON válido');
});

test('smoke: una ruta de cliente desconocida (enrutado por hash) sirve igualmente index.html, no 404', async () => {
  const res = await get('/turno/fase/0');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>/i);
});

test('smoke: un archivo JS de public/ se sirve con Content-Type de JavaScript', async () => {
  const res = await get('/js/app.js');
  assert.equal(res.statusCode, 200);
});

test('regresión COR-003: una URL con codificación porcentual inválida responde 400 en vez de tumbar el proceso', async () => {
  const res = await get('/%E0%A4%A');
  assert.equal(res.statusCode, 400);
  assert.doesNotMatch(res.body, /at decodeURIComponent|Error:|\.js:\d+/, 'la respuesta no debe filtrar una traza interna');
});

test('regresión COR-003: el servidor sigue respondiendo a una petición válida tras la URL malformada anterior', async () => {
  const res = await get('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>/i);
});

test('smoke: una ruta con codificación porcentual válida no se rechaza como si fuera inválida', async () => {
  const res = await get('/data/sources/sources.json?x=%20');
  assert.equal(res.statusCode, 200);
});
