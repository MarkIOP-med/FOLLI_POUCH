#include "config.h"

// Per-user record (userId, assigned, userDefaultPressure[4]) — RAM only, same as the
// rest of config.h's state. Does NOT survive a power-cycle or reflash: on every boot
// this pouch comes back up with no user assigned, running on the factory-default
// pressure regime. If that needs to change later, this is the file to add
// NVS/Preferences-backed persistence back into — see POUCH_ESP.md's "Data Model"
// section.

void initUserProfile() {
  // Boot checked out to NO_USER with the factory regime, so the console can start a
  // session on its own (no app needed). The app overrides this by checking out a patient.
  userId   = NO_USER_ID;
  assigned = true;
  strncpy(userName, NO_USER_NAME, USER_NAME_MAX);
  userName[USER_NAME_MAX] = '\0';
  for (int i = 0; i < 4; i++) userDefaultPressure[i] = systemDefaultPressure[i];
}

void saveCurrentAsUserDefault() {
  for (int i = 0; i < 4; i++) userDefaultPressure[i] = currentTargetPressure[i];
  Serial.println("User default pressure saved (RAM only — lost on power-cycle).");
}

void assignNewUser() {
  static int assignCounter = 0;  // RAM only — resets to 0 each boot, so ids can repeat across power-cycles

  assignCounter++;
  userId   = assignCounter;
  assigned = true;
  userName[0] = '\0';
  for (int i = 0; i < 4; i++) userDefaultPressure[i] = systemDefaultPressure[i];

  Serial.print("New user assigned, userId=");
  Serial.println(userId);
}
