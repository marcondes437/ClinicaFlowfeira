import net from 'node:net';

/** Probe before opening PostgreSQL, so a second start cannot disturb the running app. */
export async function serverStatus(port = 3000) {
  const occupied = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(true) : reject(error));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(false)));
  });
  if (!occupied) return 'free';
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (response.ok && (await response.text()).includes('ClinicaFlow')) return 'clinicaflow';
  } catch { /* Another app or a server still starting. Never stop it automatically. */ }
  return 'occupied';
}
