#include "config.h"

// Per-user record (userId, assigned, savedPressure[4]) — RAM only, same as the rest of
// config.h's state. Does NOT survive a power-cycle or reflash: on every boot this pouch
// comes back up with no user assigned, running on the factory-default pressure regime.
// If that needs to change later, this is the file to add NVS/Preferences-backed
// persistence back into — see COMMUNICATION.md's "Three data tiers".

void initUserProfile() {
  userId   = -1;
  assigned = false;
  for (int i = 0; i < 4; i++) savedPressure[i] = defaultPressure[i];
}

void saveCurrentAsUserDefault() {
  for (int i = 0; i < 4; i++) savedPressure[i] = targetPressure[i];
  Serial.println("User default pressure saved (RAM only — lost on power-cycle).");
}

void assignNewUser() {
  static int assignCounter = 0;  // RAM only — resets to 0 each boot, so ids can repeat across power-cycles

  assignCounter++;
  userId   = assignCounter;
  assigned = true;
  for (int i = 0; i < 4; i++) savedPressure[i] = defaultPressure[i];

  Serial.print("New user assigned, userId=");
  Serial.println(userId);
}
