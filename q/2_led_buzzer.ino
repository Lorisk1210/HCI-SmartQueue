// =====================================================================
// RGB LED & BUZZER FEEDBACK SYSTEM
// =====================================================================
// Controls the RGB LED and passive buzzer for visual and audio feedback.
// Patterns represent different system states and user interactions.

// Helper: Write PWM-compatible values to pins (handles digital-only pins)
void analogWriteSafe(uint8_t pin, int value) {
  // Check if this pin supports PWM
  if (pin == 3 || pin == 5 || pin == 6 || pin == 9 || pin == 10 || pin == 11) {
    analogWrite(pin, value);
  } else {
    // For non-PWM pins, use simple on/off
    digitalWrite(pin, value > 0 ? HIGH : LOW);
  }
}

// Set RGB LED color (0-255 for each channel)
void setColor(int r, int g, int b) {
  analogWriteSafe(RED_PIN,   constrain(r, 0, 255));
  analogWriteSafe(GREEN_PIN, constrain(g, 0, 255));
  analogWriteSafe(BLUE_PIN,  constrain(b, 0, 255));
}

// Generate a tone from the passive buzzer at a specific frequency and duration
void beep(int frequency, int duration_ms) {
  if (frequency <= 0 || duration_ms <= 0) return;
  
  long period_us = 1000000L / frequency;
  long cycles = (long)frequency * duration_ms / 1000;
  
  for (long i = 0; i < cycles; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delayMicroseconds(period_us / 2);
    digitalWrite(BUZZER_PIN, LOW);
    delayMicroseconds(period_us / 2);
  }
}

// Feedback: Person successfully entered the library (green + beeps)
void successFeedback() {
  setColor(0, 255, 0);   // Green
  beep(900, 80);
  delay(20);
  beep(1200, 100);
  delay(1500);           // Keep green on longer
  setColor(0, 0, 255);   // Back to Blue
}

// Feedback: Person added to waiting queue (yellow + medium beep)
void waitFeedback() {
  setColor(255, 200, 0); // Yellow
  beep(700, 120);
  delay(1200);           // Keep yellow on longer
  setColor(0, 0, 255);   // Back to Blue
}

// Feedback: Card is already in the queue (yellow + low beep)
void alreadyInQueueFeedback() {
  setColor(255, 200, 0); // Yellow (queued)
  beep(600, 60);
  delay(1000);           // Keep yellow on longer
  setColor(0, 0, 255);   // Back to Blue
}

// Feedback: Person left the library (cyan + low beep)
void leaveFeedback() {
  setColor(0, 255, 255); // Cyan
  beep(500, 80);
  delay(1200);           // Keep cyan on longer
  setColor(0, 0, 255);   // Back to Blue
}

// Feedback: Request denied - library or queue full (red + low beep)
void deniedFeedback() {
  setColor(255, 0, 0);   // Red
  beep(300, 200);
  delay(1500);           // Keep red on longer
  setColor(0, 0, 255);   // Back to Blue
}

// Feedback: Proximity trigger detected - ball about to drop (pink/magenta + ascending beeps)
void proximityFeedback() {
  setColor(255, 80, 180); // Pink/Magenta
  beep(1200, 60);
  delay(20);
  beep(1400, 60);
  delay(20);
  beep(1600, 60);
  delay(800);            // Keep pink on longer
  setColor(0, 0, 255);   // Back to Blue
}
