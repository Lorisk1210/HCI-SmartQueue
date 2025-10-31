// =====================================================================
// WhatsApp Webhook Route - Handle User Replies
// =====================================================================
// Receives WhatsApp messages from Twilio when users reply to notifications.
// Parses the reply (button click or text message) and either confirms entry
// or removes the user from the queue. Returns TwiML responses for Twilio to
// send back to the user.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ARDUINO_BASE_URL = 'http://172.20.10.2';

// =====================================================================
// Environment Helpers
// =====================================================================
// Normalises WhatsApp numbers by stripping the protocol prefix so we can
// safely compare values coming from Twilio (which always include it) with
// the value configured via environment variables (which might or might not).
function normaliseWhatsAppNumber(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/^whatsapp:/i, '').trim();
}

const configuredRecipient = normaliseWhatsAppNumber(process.env.TWILIO_TO);

// =====================================================================
// Helper Functions
// =====================================================================
function getArduinoBaseUrl(): string {
  const base = process.env.ARDUINO_BASE_URL || DEFAULT_ARDUINO_BASE_URL;
  return base.replace(/\/$/, '');
}

// =====================================================================
// POST Handler - Process User Reply
// =====================================================================
// Handle incoming WhatsApp messages (webhook from Twilio). This receives
// responses when users click buttons or send text messages. Validates the
// sender, fetches the current queue state to find the first person, then
// processes the reply to either confirm entry or leave the queue.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get('From')?.toString();
    const body = formData.get('Body')?.toString() || '';
    const buttonText = formData.get('ButtonText')?.toString(); // If button was clicked
    
    console.log('WhatsApp webhook received:', { from, body, buttonText });

    // =====================================================================
    // Sender Validation
    // =====================================================================
    // Only process messages from the verified number to prevent unauthorized
    // access to queue management functions.
    if (!configuredRecipient) {
      console.error('WhatsApp webhook misconfigured: TWILIO_TO is not set.');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const fromNumber = normaliseWhatsAppNumber(from);

    if (!fromNumber || fromNumber !== configuredRecipient) {
      console.warn('WhatsApp webhook rejected message from unexpected sender', { from });
      return new NextResponse('Unauthorized', { status: 403 });
    }

    // =====================================================================
    // Queue State Fetching
    // =====================================================================
    // Get current queue state to find the first person who should respond.
    // Connects to the Arduino SSE endpoint and reads the first message to
    // extract the queue state.
    const arduinoBase = getArduinoBaseUrl();
    let firstInQueue: string | null = null;
    
    try {
      // Fetch current state from Arduino SSE endpoint
      const response = await fetch(`${arduinoBase}/events`, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        // Read first few chunks to get state
        const { value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          // Extract JSON from SSE format (data: {...})
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.queue && data.queue.length > 0) {
                  firstInQueue = data.queue[0];
                }
                break;
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
        reader.releaseLock();
      }
    } catch (err) {
      console.error('Failed to get Arduino state:', err);
    }

    // =====================================================================
    // Response Processing
    // =====================================================================
    // Parse user response (button click or text message). Supports multiple
    // formats: "1" or "YES" or "enter" for confirmation, "2" or "NO" or "leave"
    // for leaving the queue. Processes the action and returns appropriate TwiML.
    const responseText = (buttonText || body).toLowerCase().trim();
    
    // Handle button clicks or text responses
    if (responseText.includes('1') || 
        responseText.includes('yes') || 
        responseText.includes('enter') ||
        buttonText === 'Yes, I want to enter') {
      
      // User confirmed entry
      if (firstInQueue) {
        try {
          // Call entry confirmation API
          const confirmResponse = await fetch(`${req.nextUrl.origin}/api/queue/entry/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: firstInQueue }),
          });
          
          const confirmData = await confirmResponse.json();
          
          if (confirmData.ok) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ Entry confirmed! You have 15 minutes to scan your card at the entrance.</Message>
</Response>`;
            return new NextResponse(twiml, {
              status: 200,
              headers: { 'Content-Type': 'text/xml' },
            });
          } else {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>⚠️ ${confirmData.error || 'Confirmation failed. The 5-minute window may have expired.'}</Message>
</Response>`;
            return new NextResponse(twiml, {
              status: 200,
              headers: { 'Content-Type': 'text/xml' },
            });
          }
        } catch (err) {
          console.error('Confirmation error:', err);
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ Could not process confirmation. Please use the web dashboard.</Message>
</Response>`;
          return new NextResponse(twiml, {
            status: 200,
            headers: { 'Content-Type': 'text/xml' },
          });
        }
      } else {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>⚠️ Could not find queue position. Please use the web dashboard.</Message>
</Response>`;
        return new NextResponse(twiml, {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      
    } else if (responseText.includes('2') || 
               responseText.includes('no') || 
               responseText.includes('leave') ||
               buttonText === 'No, leave queue') {
      
      // User wants to leave queue
      if (firstInQueue) {
        try {
          // Call leave queue API
          const leaveResponse = await fetch(`${req.nextUrl.origin}/api/queue/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: firstInQueue }),
          });
          
          const leaveData = await leaveResponse.json();
          
          if (leaveData.ok) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ You have been removed from the queue.</Message>
</Response>`;
            return new NextResponse(twiml, {
              status: 200,
              headers: { 'Content-Type': 'text/xml' },
            });
          } else {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>⚠️ Could not leave queue. You may not be in the queue.</Message>
</Response>`;
            return new NextResponse(twiml, {
              status: 200,
              headers: { 'Content-Type': 'text/xml' },
            });
          }
        } catch (err) {
          console.error('Leave error:', err);
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ Could not process leave request. Please use the web dashboard.</Message>
</Response>`;
          return new NextResponse(twiml, {
            status: 200,
            headers: { 'Content-Type': 'text/xml' },
          });
        }
      } else {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>⚠️ Could not find queue position. Please use the web dashboard.</Message>
</Response>`;
        return new NextResponse(twiml, {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
    }

    // =====================================================================
    // Unknown Response
    // =====================================================================
    // If the response doesn't match expected patterns, send instructions
    // back to the user explaining how to reply.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Reply with:\n1️⃣ or YES - Confirm entry\n2️⃣ or NO - Leave queue</Message>
</Response>`;
    
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>An error occurred. Please use the web dashboard.</Message>
</Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

