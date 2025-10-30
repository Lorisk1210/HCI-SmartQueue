/**
 * Shared state for managing entry confirmation requests
 * When a user becomes first in queue with a free slot, they have 5 minutes to confirm they still want to enter
 * This is a simple in-memory store. In production, use Redis or a database.
 */

export interface PendingEntryConfirmation {
  uid: string;
  requestedAt: number;
  confirmed: boolean;
  timeoutId?: NodeJS.Timeout;
}

const pendingConfirmations = new Map<string, PendingEntryConfirmation>();

const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start entry confirmation - called when user becomes first in queue with free slot
 */
export function startEntryConfirmation(uid: string): {
  pending: boolean;
  timeRemainingMs: number;
  wasAlreadyPending: boolean;
} {
  const existing = pendingConfirmations.get(uid);
  
  if (existing && !existing.confirmed) {
    // Already has pending confirmation, return current status
    const timeRemaining = CONFIRMATION_TIMEOUT_MS - (Date.now() - existing.requestedAt);
    return {
      pending: true,
      timeRemainingMs: Math.max(0, timeRemaining),
      wasAlreadyPending: true,
    };
  }

  // Clear any existing timeout
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  // Create new confirmation request
  const confirmation: PendingEntryConfirmation = {
    uid,
    requestedAt: Date.now(),
    confirmed: false,
  };
  
  pendingConfirmations.set(uid, confirmation);

  return {
    pending: true,
    timeRemainingMs: CONFIRMATION_TIMEOUT_MS,
    wasAlreadyPending: false,
  };
}

/**
 * Set up auto-removal callback for a pending confirmation
 */
export function setupAutoRemoval(
  uid: string,
  onTimeout: (uid: string) => void | Promise<void>
): void {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation || confirmation.confirmed) return;

  // Clear existing timeout if any
  if (confirmation.timeoutId) {
    clearTimeout(confirmation.timeoutId);
  }

  // Set new timeout
  const timeoutId = setTimeout(async () => {
    const current = pendingConfirmations.get(uid);
    if (current && !current.confirmed) {
      // User didn't confirm within 5 minutes
      pendingConfirmations.delete(uid);
      await onTimeout(uid);
    }
  }, CONFIRMATION_TIMEOUT_MS);

  confirmation.timeoutId = timeoutId;
  pendingConfirmations.set(uid, confirmation);
}

/**
 * Confirm the entry - user still wants to enter
 */
export function confirmEntry(uid: string): boolean {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation) {
    return false; // No pending confirmation
  }

  if (confirmation.confirmed) {
    return false; // Already confirmed
  }

  // Check if expired
  const timeRemaining = CONFIRMATION_TIMEOUT_MS - (Date.now() - confirmation.requestedAt);
  if (timeRemaining <= 0) {
    pendingConfirmations.delete(uid);
    return false; // Expired
  }

  // Mark as confirmed and clear timeout
  confirmation.confirmed = true;
  if (confirmation.timeoutId) {
    clearTimeout(confirmation.timeoutId);
  }
  
  // Remove from map after a short delay
  setTimeout(() => {
    pendingConfirmations.delete(uid);
  }, 1000);

  return true;
}

/**
 * Get status of a pending entry confirmation
 */
export function getEntryConfirmationStatus(uid: string): {
  pending: boolean;
  timeRemainingMs: number;
} | null {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation) {
    return null;
  }

  if (confirmation.confirmed) {
    return null;
  }

  const timeRemaining = CONFIRMATION_TIMEOUT_MS - (Date.now() - confirmation.requestedAt);
  if (timeRemaining <= 0) {
    pendingConfirmations.delete(uid);
    return null;
  }

  return {
    pending: true,
    timeRemainingMs: Math.max(0, timeRemaining),
  };
}

/**
 * Cancel/clear entry confirmation (e.g., if user leaves or enters)
 */
export function clearEntryConfirmation(uid: string): void {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation) return;

  if (confirmation.timeoutId) {
    clearTimeout(confirmation.timeoutId);
  }
  
  pendingConfirmations.delete(uid);
}

