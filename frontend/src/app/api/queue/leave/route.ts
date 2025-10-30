export const runtime = 'nodejs';

const DEFAULT_ARDUINO_BASE_URL = 'http://172.20.10.2';

function getArduinoBaseUrl(): string {
  const base = process.env.ARDUINO_BASE_URL || DEFAULT_ARDUINO_BASE_URL;
  return base.replace(/\/$/, '');
}

export async function POST(req: Request) {
  let uid: string | undefined;
  try {
    const body = await req.json();
    uid = body?.uid;
  } catch (_) {
    // ignore, will validate below
  }
  if (!uid || typeof uid !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'uid required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = getArduinoBaseUrl();
  const url = `${base}/api/queue/leave?uid=${encodeURIComponent(uid)}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { method: 'GET', cache: 'no-store' });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'arduino unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}


