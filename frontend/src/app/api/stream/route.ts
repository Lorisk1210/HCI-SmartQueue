export const runtime = 'nodejs';

const DEFAULT_ARDUINO_BASE_URL = 'http://172.20.10.2';

function getArduinoEventsUrl(): string {
  const base = process.env.ARDUINO_BASE_URL || DEFAULT_ARDUINO_BASE_URL;
  const trimmed = base.replace(/\/$/, '');
  return `${trimmed}/events`;
}

export async function GET(request: Request) {
  const upstreamUrl = getArduinoEventsUrl();
  const clientLastEventId = request.headers.get('last-event-id') || undefined;

  const controller = new AbortController();
  const abortUpstream = () => controller.abort();

  // Abort upstream when client disconnects
  request.signal.addEventListener('abort', abortUpstream);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: clientLastEventId ? { 'Last-Event-ID': clientLastEventId } : undefined,
      signal: controller.signal,
      // Do not cache SSE
      cache: 'no-store',
    });
  } catch (err) {
    request.signal.removeEventListener('abort', abortUpstream);
    return new Response(`Failed to reach Arduino at ${upstreamUrl}`, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    request.signal.removeEventListener('abort', abortUpstream);
    return new Response(`Arduino responded with ${upstream.status}`, { status: 502 });
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


