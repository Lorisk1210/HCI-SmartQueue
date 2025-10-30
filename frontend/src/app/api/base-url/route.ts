export const runtime = 'nodejs';

import os from 'os';

function pickLanIp(): string | null {
  const nets = os.networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        candidates.push(ni.address);
      }
    }
  }
  // Prefer iPhone hotspot range first (172.20.10.x), then other common ranges
  const preferred = candidates.find(ip => ip.startsWith('172.20.10.'))
    || candidates.find(ip => ip.startsWith('192.168.4.'))  // Arduino AP
    || candidates.find(ip => ip.startsWith('192.168.'))    // Common router range
    || candidates.find(ip => ip.startsWith('10.'))          // Another common range
    || candidates[0];
  return preferred || null;
}

export async function GET(req: Request) {
  const host = req.headers.get('host') || '';
  let port = 3000;
  const colon = host.indexOf(':');
  if (colon !== -1) {
    const p = parseInt(host.slice(colon + 1), 10);
    if (!isNaN(p)) port = p;
  }
  const ip = pickLanIp();
  if (!ip) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const baseUrl = `http://${ip}:${port}`;
  return new Response(JSON.stringify({ ok: true, baseUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


