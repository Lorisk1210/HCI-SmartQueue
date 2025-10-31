// =====================================================================
// SSE Stream Route - Arduino Event Stream Proxy
// =====================================================================
// Next.js API route that proxies Server-Sent Events (SSE) from the Arduino
// to the browser. This is necessary because the Arduino may be on a different
// network or IP address than what the browser can directly access. The route
// discovers the Arduino's IP address and forwards the event stream with
// proper SSE headers and connection management.

export const runtime = 'nodejs';

import { getArduinoBaseUrl } from '@/app/lib/arduino-discovery';

// =====================================================================
// Helper Functions
// =====================================================================
function getArduinoEventsUrl(base: string): string {
  const trimmed = base.replace(/\/$/, '');
  return `${trimmed}/events`;
}

// =====================================================================
// GET Handler - Stream Setup
// =====================================================================
// Sets up the SSE stream connection to the Arduino. Implements retry logic
// with exponential backoff and connection timeouts. If the connection fails,
// returns an error response. Otherwise, pipes the stream to the client.
export async function GET(request: Request) {
  // =====================================================================
  // Arduino Discovery
  // =====================================================================
  // Try to discover Arduino first - may need to try multiple IP addresses
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

  const CONNECT_TIMEOUT_MS = Number(process.env.STREAM_CONNECT_TIMEOUT_MS || '') || 30000;
  const MAX_CONNECT_ATTEMPTS = Math.max(1, Number(process.env.STREAM_CONNECT_ATTEMPTS || '') || 3);
  const CONNECT_RETRY_DELAY_MS = Math.max(0, Number(process.env.STREAM_CONNECT_RETRY_DELAY_MS || '') || 600);

  // =====================================================================
  // Connection Retry Loop
  // =====================================================================
  // Attempt to connect to Arduino with retries. Each attempt has a timeout
  // to avoid hanging indefinitely on unreachable addresses.
  let lastError: unknown = undefined;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      console.log(`[stream] Connecting to Arduino at ${upstreamUrl} (attempt ${attempt}/${MAX_CONNECT_ATTEMPTS})`);

      const timeoutController = new AbortController();
      timeoutId = setTimeout(() => {
        console.log(`[stream] Connection timeout after ${CONNECT_TIMEOUT_MS}ms (attempt ${attempt})`);
        timeoutController.abort();
        controller.abort();
      }, CONNECT_TIMEOUT_MS);

      abortHandler = () => timeoutController.abort();
      controller.signal.addEventListener('abort', abortHandler);

      upstream = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          ...(clientLastEventId ? { 'Last-Event-ID': clientLastEventId } : {}),
        },
        signal: timeoutController.signal,
        cache: 'no-store',
      });

      if (timeoutId) clearTimeout(timeoutId);
      if (abortHandler) controller.signal.removeEventListener('abort', abortHandler);
      console.log(`[stream] Arduino responded with status ${upstream.status}, body: ${upstream.body ? 'present' : 'missing'}`);
      if (upstream.ok && upstream.body) {
        break;
      }
      lastError = new Error(`Upstream responded ${upstream.status}`);
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (abortHandler) controller.signal.removeEventListener('abort', abortHandler);
      lastError = err;
      console.error(`[stream] Failed to reach Arduino at ${upstreamUrl} (attempt ${attempt}):`, err?.message || err);
    }

    if (attempt < MAX_CONNECT_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAY_MS));
    }
  }

  if (!upstream) {
    request.signal.removeEventListener('abort', abortUpstream);
    const errorMsg = `Cannot reach Arduino at ${arduinoBase}. Error: ${(lastError as any)?.message || 'Connection error'}.`;
    return new Response(errorMsg, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`[stream] Arduino responded with ${upstream.status}, body: ${upstream.body ? 'present' : 'missing'}`);
    request.signal.removeEventListener('abort', abortUpstream);
    const errorMsg = `Arduino at ${arduinoBase} responded with status ${upstream.status}. Check Arduino IP and network connection.`;
    return new Response(errorMsg, { status: 502 });
  }

  // =====================================================================
  // Stream Piping
  // =====================================================================
  // Create a passthrough TransformStream to pipe SSE bytes from Arduino
  // to the browser client. When the client disconnects, abort the upstream
  // connection to clean up resources.
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


