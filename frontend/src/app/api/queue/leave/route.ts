// =====================================================================
// Leave Queue Route - Remove User from Queue
// =====================================================================
// API route that removes a user from the waiting queue. Receives the user's
// UID and proxies the request to the Arduino. Returns success
// or an error if the Arduino is unreachable.

export const runtime = 'nodejs';

import { getArduinoBaseUrl } from '@/app/lib/arduino-discovery';

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

  const base = await getArduinoBaseUrl();
  const url = `${base}/api/queue/leave?uid=${encodeURIComponent(uid)}`;
  let upstream: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    upstream = await fetch(url, { 
      method: 'GET', 
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    console.error('[queue/leave] Failed to reach Arduino:', err?.message || err);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'arduino unreachable',
      details: err?.message || 'Connection error'
    }), {
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


