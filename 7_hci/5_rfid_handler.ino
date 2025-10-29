// =====================================================================
// RFID CARD READER HANDLER
// =====================================================================
// Detects RFID card scans and manages queue/library entry based on:
// - Whether the person is already inside (remove = leave)
// - Whether they're in the queue (move to library if space)
// - New scan: add to library or queue depending on space

MFRC522 mfrc522(SDA_PIN, RST_PIN);

// Poll for new RFID card scans and process them
void handleRFID() {
  // Check if a new card is in range
  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial())   return;
  
  // Read the card's unique ID and format it as hex string
  String id = formatUid(mfrc522.uid);
  Serial.print("Card detected! UID: ");
  Serial.println(id);
  
  // Check if this card is already in the library or in queue
  int libIdx = indexOfInLibrary(id);
  int qIdx   = indexOfWaitQueue(id);
  
  // Case 1: Card is in the library - this is a person leaving
  if (libIdx >= 0) {
    removeFromLibrary(id);
    setStatus("Left: " + id + ". Free slots: " + String(getFreeSlots()));
    setScanEvent("left", id);
    leaveFeedback();
  }
  
  // Case 2: Card is in the waiting queue - try to move to library
  else if (qIdx >= 0) {
    int slotsNow = getFreeSlots();
    
    // If there are enough free slots for them to enter now
    if (qIdx < slotsNow) {
      removeFromWaitByIndex(qIdx);
      addToLibrary(id);
      setStatus("Entered from queue: " + id + " (" + String(inCount) + "/" + String(MAX_SLOTS) + ")");
      setScanEvent("entered_from_queue", id);
      successFeedback();
    }
    // Otherwise they're still in queue (maybe their position improved)
    else {
      setStatus("Already in queue: " + id + " (pos " + String(qIdx + 1) + ")");
      setScanEvent("already_queued", id);
      alreadyInQueueFeedback();
    }
  }
  
  // Case 3: New card - not in library or queue
  else {
    int slotsNow = getFreeSlots();
    
    // If there's space available, add directly to library
    if (slotsNow > queueCount) {
      addToLibrary(id);
      setStatus("Entered: " + id + " (" + String(inCount) + "/" + String(MAX_SLOTS) + ")");
      setScanEvent("entered", id);
      successFeedback();
    }
    // Otherwise add to waiting queue
    else {
      bool ok = enqueueWait(id);
      if (ok) {
        setStatus("Added to queue: " + id + " (pos " + String(queueCount) + ")");
        setScanEvent("queued", id);
        waitFeedback();
      } else {
        // Queue is full - cannot accommodate
        setStatus("Queue full, cannot add: " + id);
        setScanEvent("denied", id);
        deniedFeedback();
      }
    }
  }
  
  // Clean up RFID reader and notify frontend of state changes
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  broadcastState();
  delay(800); // Debounce delay to prevent rapid re-scans
}
