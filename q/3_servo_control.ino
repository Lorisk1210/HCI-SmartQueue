// =====================================================================
// SERVO MOTOR CONTROL (SG90)
// =====================================================================
// Handles smooth control of the servo motor for the ball-dropping mechanism.
// Uses state machine to manage drop and return cycles.

Servo myServo;

// Servo state tracking
bool servoMoving = false;              // Currently in motion (drop + return cycle)
unsigned long servoStartTime = 0;      // When current movement cycle started
unsigned long servoReturnTime = 0;     // When return-to-home phase started

// Trigger an immediate servo drop without waiting for proximity sensor
// Useful for manual control or testing
void triggerServoDrop() {
  unsigned long now = millis();
  
  if (servoMoving) return; // Already moving, ignore request
  
  myServo.write(SERVO_TRIGGER_ANGLE); // Move to drop position
  delay(100);
  myServo.write(SERVO_HOME_ANGLE);    // Immediately return
  
  servoMoving = true;
  servoStartTime = now;
  servoReturnTime = 0; // Mark that return phase hasn't started yet
  
  setStatus("Servo: manual ball drop triggered");
}

// Pump function - called from main loop to manage servo state machine
// Handles the timing of drop → wait → return → home cycles
void pumpServo() {
  if (!servoMoving) return; // Nothing to do
  
  unsigned long now = millis();
  
  // Phase 1: Waiting for servo to move to drop position
  if (now - servoStartTime < SERVO_DROP_TIME_MS) {
    return; // Still in drop phase, wait more
  }
  
  // Phase 2: Time to begin return to home (if we haven't already)
  if (servoReturnTime == 0) {
    myServo.write(SERVO_HOME_ANGLE);
    servoReturnTime = now;
    return; // Wait for return movement to complete
  }
  
  // Phase 3: Waiting for servo to return home
  if (now - servoReturnTime < SERVO_RETURN_TIME_MS) {
    return; // Still returning, wait more
  }
  
  // Phase 4: Movement cycle complete - reset state machine
  servoMoving = false;
  servoStartTime = 0;
  servoReturnTime = 0;
}
