export const runtime = 'nodejs';

import { getArduinoBaseUrl } from '@/app/lib/arduino-discovery';

function getArduinoEventsUrl(base: string): string {
  const trimmed = base.replace(/\/$/, '');
  return `${trimmed}/events`;
}

export async function GET(request: Request) {
  // Try to discover Arduino first
  const arduinoBase = await getArduinoBaseUrl();
  const upstreamUrl = getArduinoEventsUrl(arduinoBase);
  const clientLastEventId = request.headers.get('last-event-id') || undefined;

  const controller = new AbortController();
  const abortUpstream = () => controller.abort();

  // Abort upstream when client disconnects
  request.signal.addEventListener('abort', abortUpstream);

  let upstream: Response;
  let timeoutId: NodeJS.Timeout | undefined;
  let abortHandler: (() => void) | undefined;
  
  try {
    console.log(`[stream] Connecting to Arduino at ${upstreamUrl}`);
    
    // Create a timeout controller - give it 15 seconds to establish connection
    const timeoutController = new AbortController();
    timeoutId = setTimeout(() => {
      console.log(`[stream] Connection timeout after 15s`);
      timeoutController.abort();
      controller.abort();
    }, 15000);
    
    // Listen to both signals
    abortHandler = () => timeoutController.abort();
    controller.signal.addEventListener('abort', abortHandler);
    
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        ...(clientLastEventId ? { 'Last-Event-ID': clientLastEventId } : {}),
      },
      signal: timeoutController.signal,
      // Do not cache SSE
      cache: 'no-store',
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    if (abortHandler) controller.signal.removeEventListener('abort', abortHandler);
    console.log(`[stream] Arduino responded with status ${upstream.status}, body: ${upstream.body ? 'present' : 'missing'}`);
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortHandler) controller.signal.removeEventListener('abort', abortHandler);
    console.error(`[stream] Failed to reach Arduino at ${upstreamUrl}:`, err?.message || err);
    request.signal.removeEventListener('abort', abortUpstream);
    const errorMsg = `Cannot reach Arduino at ${arduinoBase}. Error: ${err?.message || 'Connection error'}. Make sure Arduino is powered on and connected to the same WiFi network.`;
    return new Response(errorMsg, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`[stream] Arduino responded with ${upstream.status}, body: ${upstream.body ? 'present' : 'missing'}`);
    request.signal.removeEventListener('abort', abortUpstream);
    const errorMsg = `Arduino at ${arduinoBase} responded with status ${upstream.status}. Check Arduino IP and network connection.`;
    return new Response(errorMsg, { status: 502 });
  }

  // Create a passthrough TransformStream to pipe SSE bytes
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Pipe upstream body to client
  (async () => {
    try {
      const reader = upstream.body!.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) await writer.write(value);
      }
    } catch (_) {
      // Silently end on errors; client side will handle reconnect policy
    } finally {
      try { await writer.close(); } catch (_) {}
      request.signal.removeEventListener('abort', abortUpstream);
      controller.abort();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Allow same-origin browser to keep the stream; no CORS here since same origin
      // If you need cross-origin, add appropriate CORS headers here.
    },
  });
}


