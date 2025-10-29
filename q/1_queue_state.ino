// =====================================================================
// QUEUE & LIBRARY STATE MANAGEMENT
// =====================================================================
// Manages the list of people currently in the library and the waiting queue.

// Arrays to track state
String inLibrary[MAX_SLOTS];     // Cards currently in the library
uint8_t inCount = 0;            // Count of people in library

String waitQueue[WAIT_CAPACITY]; // Cards waiting to enter
uint8_t queueCount = 0;         // Count of people in queue

// Status message tracking for web interface
String lastStatusMsg;
unsigned long lastStatusMillis = 0;

// Event tracking for frontend notifications
String lastScanEvent = "";
String lastScannedCard = "";
unsigned long lastScanTimestamp = 0;

// Update the status message that appears on the web dashboard
void setStatus(const String &msg) {
  lastStatusMsg = msg;
  lastStatusMillis = millis();
}

// Record a scan event for the frontend to display
void setScanEvent(const String &event, const String &cardId) {
  lastScanEvent = event;
  lastScannedCard = cardId;
  lastScanTimestamp = millis();
}

// Find the index of a card in the library array, or -1 if not found
int indexOfInLibrary(const String &id) {
  for (uint8_t i = 0; i < inCount; i++) {
    if (inLibrary[i] == id) return i;
  }
  return -1;
}

// Find the index of a card in the waiting queue, or -1 if not found
int indexOfWaitQueue(const String &id) {
  for (uint8_t i = 0; i < queueCount; i++) {
    if (waitQueue[i] == id) return i;
  }
  return -1;
}

// Try to add a card to the library. Returns false if already there or library is full.
bool addToLibrary(const String &id) {
  if (inCount >= MAX_SLOTS) return false;
  if (indexOfInLibrary(id) != -1) return false;
  inLibrary[inCount++] = id;
  return true;
}

// Remove a card from the library. Returns false if card not found.
bool removeFromLibrary(const String &id) {
  int idx = indexOfInLibrary(id);
  if (idx == -1) return false;
  // Shift remaining cards down to fill the gap
  for (uint8_t i = idx + 1; i < inCount; i++) {
    inLibrary[i - 1] = inLibrary[i];
  }
  inCount--;
  return true;
}

// Try to add a card to the waiting queue. Returns false if already queued or queue is full.
bool enqueueWait(const String &id) {
  if (queueCount >= WAIT_CAPACITY) return false;
  if (indexOfWaitQueue(id) != -1) return false;
  waitQueue[queueCount++] = id;
  return true;
}

// Remove a card from the queue at a specific position. Returns false if index is invalid.
bool removeFromWaitByIndex(uint8_t idx) {
  if (idx >= queueCount) return false;
  // Shift remaining cards down to fill the gap
  for (uint8_t i = idx + 1; i < queueCount; i++) {
    waitQueue[i - 1] = waitQueue[i];
  }
  queueCount--;
  return true;
}
