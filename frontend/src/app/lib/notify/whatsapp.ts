/**
 * WhatsApp notification service
 * Monitors queue state and sends notifications via Twilio
 */

let lastNotifiedQueued = false;
let lastNotifiedReady = false;
let lastQueueState: {
  freeSlots: number;
  nextTicket: string | null;
  queueCount: number;
} | null = null;

/**
 * Send a WhatsApp notification
 */
export async function sendWhatsAppNotification(type: 'queued' | 'ready', nextTicket?: string): Promise<void> {
  try {
    const response = await fetch('/api/notify/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, nextTicket }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send WhatsApp notification:', error);
      return;
    }

    const result = await response.json();
    console.log('WhatsApp notification sent:', result);
  } catch (error) {
    console.error('Error sending WhatsApp notification:', error);
  }
}

/**
 * Handle RFID scan event - send notification if someone is queued
 */
export function handleRfidScan(scan: { reason?: string; uid?: string }): void {
  // Send notification when someone is added to queue
  // Note: This will trigger for anyone added to queue, but we'll only send
  // to the fixed number (as per requirement: "always be the same number no matter who")
  if (scan.reason === 'queued' && !lastNotifiedQueued) {
    lastNotifiedQueued = true;
    sendWhatsAppNotification('queued').catch(console.error);
    
    // Reset after a delay to allow re-notification if needed
    setTimeout(() => {
      lastNotifiedQueued = false;
    }, 10000); // 10 second cooldown
  }
}

/**
 * Handle queue state update - send notification when slot is free and first in queue
 */
export function handleQueueUpdate(update: {
  freeSlots: number;
  nextTicket: string | null;
  length: number;
}): void {
  // Check if someone is first in queue with a free slot available
  const isReady = update.freeSlots > 0 && update.nextTicket !== null && update.length > 0;
  
  // Detect transition from "not ready" to "ready"
  const wasReady = lastQueueState
    ? lastQueueState.freeSlots > 0 && lastQueueState.nextTicket !== null && lastQueueState.queueCount > 0
    : false;
  
  const justBecameReady = isReady && !wasReady;
  
  if (justBecameReady && !lastNotifiedReady) {
    lastNotifiedReady = true;
    // Pass the nextTicket UID so webhook knows who to confirm
    sendWhatsAppNotification('ready', update.nextTicket || undefined).catch(console.error);
    
    // Reset after a delay to allow re-notification if slot becomes unavailable then available again
    setTimeout(() => {
      lastNotifiedReady = false;
    }, 30000); // 30 second cooldown
  }
  
  // Update last known state
  lastQueueState = {
    freeSlots: update.freeSlots,
    nextTicket: update.nextTicket,
    queueCount: update.length,
  };
}

/**
 * Reset notification state (useful for testing)
 */
export function resetNotificationState(): void {
  lastNotifiedQueued = false;
  lastNotifiedReady = false;
  lastQueueState = null;
}

