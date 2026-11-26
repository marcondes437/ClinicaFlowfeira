import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { serverStatus } from './local-server-status.mjs';

test('startup distinguishes a free port, ClinicaFlow and an unrelated app without stopping it', async () => {
  let body = '<html>ClinicaFlow</html>';
  const server = http.createServer((_req, res) => res.end(body));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    assert.equal(await serverStatus(port), 'clinicaflow');
    body = '<html>Another app</html>';
    assert.equal(await serverStatus(port), 'occupied');
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), body);
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.equal(await serverStatus(port), 'free');
});
