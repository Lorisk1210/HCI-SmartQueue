// =====================================================================
// ULTRASONIC DISTANCE SENSOR (HC-SR04)
// =====================================================================
// Measures distance to detect when users are near and triggers ball drops.
// Includes debouncing to prevent rapid re-triggers.

// Timing tracking for sensor polling
unsigned long lastUltraMillis = 0;
unsigned long lastStepTriggerMillis = 0;

// Measure distance in centimeters using the ultrasonic sensor
// Returns -1 if measurement times out (no echo received)
long measureDistanceCm() {
  // Trigger the sensor with a pulse
  digitalWrite(ULTRA_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRA_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRA_TRIG_PIN, LOW);
  
  // Measure the echo time (timeout after ~30ms)
  unsigned long duration_us = pulseIn(ULTRA_ECHO_PIN, HIGH, 30000UL);
  
  if (duration_us == 0) {
    return -1; // No echo received, measurement failed
  }
  
  // Convert time to distance: speed of sound is ~0.034 cm/microsecond
  // Divide by 2 because sound travels to object and back
  long cm = (long)(duration_us * 0.034f / 2.0f);
  return cm;
}

// Check if someone is near the sensor and trigger ball drop if conditions met
// Includes debouncing to prevent excessive rapid triggers
void maybeTriggerServoFromUltrasonic() {
  unsigned long now = millis();
  extern unsigned long lastScanTimestamp; // from 1_queue_state.ino
  extern String lastScannedCard;          // from 1_queue_state.ino
  
  // Only allow ultrasonic-triggered dispense within 10 seconds of the last RFID scan
  if (lastScanTimestamp == 0 || (now - lastScanTimestamp) > 10000UL) {
    return;
  }
  
  // Only check sensor periodically to avoid excessive polling
  if (now - lastUltraMillis < ULTRA_INTERVAL_MS) {
    return;
  }
  lastUltraMillis = now;
  
  // Don't trigger servo while it's already moving
  if (servoMoving) {
    return;
  }
  
  // Measure current distance
  long cm = measureDistanceCm();
  
  // Check if someone is in range and enough time has passed since last trigger
  if (cm > 0 && cm < ULTRA_THRESHOLD_CM) {
    if (now - lastStepTriggerMillis > STEP_TRIGGER_COOLDOWN_MS) {
      // Ensure we have a valid card from the last scan and it has not already received a dispense
      if (lastScannedCard.length() == 0) {
        return;
      }
      extern bool hasDispensedBefore(const String &id);    // from 1_queue_state.ino
      extern bool recordDispenseForCard(const String &id); // from 1_queue_state.ino
      if (hasDispensedBefore(lastScannedCard)) {
        // Already dispensed for this UID before; block further dispenses
        return;
      }
      // Trigger the servo drop
      myServo.write(SERVO_TRIGGER_ANGLE);
      delay(100);
      myServo.write(SERVO_HOME_ANGLE);
      
      // Update servo state machine
      servoMoving = true;
      servoStartTime = now;
      servoReturnTime = 0;
      lastStepTriggerMillis = now;
      
      // Record dispense against this UID and log
      recordDispenseForCard(lastScannedCard);
      setStatus("Dispensed for UID " + lastScannedCard + " (" + String(cm) + "cm)");
      proximityFeedback(); // Pink LED + ascending beeps
    }
  }
}
