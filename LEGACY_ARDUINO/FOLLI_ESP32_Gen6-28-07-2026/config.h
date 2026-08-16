#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <SPI.h>

// ==================== CONFIG ====================
int PRESSURE_TOLERANCE_MMHg   = 3;
int VALVE_PULSE_MS            = 5;
int PUMP_PULSE_NORMAL_MS      = 10;
int PUMP_PULSE_HIGH_MS        = 50;
int VALVE_SETTLE_MS           = 150;
int MAINTENANCE_INTERVAL_MS   = 2500;

// ==================== PINS ====================
#define MCP3008_CS 5 // Atod for FSR
const int valvePins[6] = {26, 4, 13, 14, 25, 27};
const int vibrationPins[4] = {16, 17, 21, 22};

#define RELIEF_PIN     valvePins[4]
#define PUMP_PIN       valvePins[5]
#define PUMP_SENSOR    4

//=============== analog sensor ===================
#define num_of_sensors 5
//const int analogPressureSensorPins[num_of_sensors] = {A7, A8, A9, A10, A11};
const int analogPressureSensorPins[num_of_sensors] = {32, 33, 34, 35, 36};
// Oversampling parameters
const int overSampling = 16;
const int overSamplingDelay = 5;     // milliseconds between cycles
const int sensorDelayMeasur = 50;    // microseconds between sensors
// Sensor parameters (for 3.3V supply)
const float Vmin = 0.2;
const float Vmax = 2.7;
const float Pmax_kPa = 100.0;
//===============

unsigned long Press_raw[num_of_sensors], Temp_raw[num_of_sensors];
float dT[num_of_sensors], p[num_of_sensors], tt[num_of_sensors], p_start[num_of_sensors];
// =============== for FSR
uint16_t fsrData[8];
// ==================== GAUGE PRESSURE ====================
int   targetPressure[4]         = {0, 0, 0, 0};
float currentPressure_gage[4]   = {0.0};
float manifoldPressure_gage     = 0.0;

unsigned long lastMaintenanceTime = 0;
unsigned long lastPrintTime       = 0;

// State machine
enum SystemState {
  IDLE,
  BATCH_PUMPING,
  MAINTENANCE,
  EMERGENCY_RELIEF,
  STOPPED
};
SystemState currentState = IDLE;

int   currentChannel      = 0;
bool  isPumpingMode       = false;


//////////////////

// Function declarations
void readFSR();
void printFSRdata();
void initValveCompressorVibration();
void updateCurrentPressures();
void reliefAllPstart();
void clearSerialPort0();
void handleSerialCommands();
void printStatusToSerial();
void runStateMachine();
void serviceNextChannelNonBlocking();
void setLedByName(const char* ledName, const char* colorName);
void turnAllOff();
#endif
