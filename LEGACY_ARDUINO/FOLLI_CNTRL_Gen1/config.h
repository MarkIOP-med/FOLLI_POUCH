#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_SH110X.h>

// ==================== CONFIG ====================
int PRESSURE_TOLERANCE_MMHg   = 3;
int VALVE_PULSE_MS            = 5;
int PUMP_PULSE_NORMAL_MS      = 10;
int PUMP_PULSE_HIGH_MS        = 50;
int VALVE_SETTLE_MS           = 150;
int MAINTENANCE_INTERVAL_MS   = 2500;

// ==================== PINS ====================
const int valvePins[9]        = {22, 23, 24, 25, 26, 27, 28, 29, 30};
const int compressorPins[5]   = {31, 32, 33, 34, 35};
const int vibrationPins[8]    = {2, 3, 4, 5, 6, 7, 8, 9};
const int fsrPins[8]          = {A0, A1, A2, A3, A4, A5, A6, A7};
const int senPins[5]          = {40, 41, 42, 43, 44};

#define RELIEF_PIN     valvePins[6]
#define PUMP_PIN       valvePins[8]
#define PUMP_SENSOR    4

// ==================== MS5806 GLOBALS ====================
#define num_of_sensors 5
#define sen0 40
#define sen1 41
#define sen2 42
#define sen3 43
#define sen4 44
#define Device_Address 0x76

unsigned int cof_arr[num_of_sensors][6];
unsigned char cof_control[6] = {0xA2, 0xA4, 0xA6, 0xA8, 0xAA, 0xAC};

unsigned long Press_raw[num_of_sensors], Temp_raw[num_of_sensors];
float dT[num_of_sensors], p[num_of_sensors], tt[num_of_sensors], p_start[num_of_sensors];

// ==================== OLED DISPLAY ====================
#define DISPLAY_RESET   34     // or -1 if sharing reset pin
#define DISPLAY_UPDATE_INTERVAL  500   // ms between display refreshes

Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &Wire, DISPLAY_RESET);

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

// Function declarations
void initValveCompressorVibration();
void init_sensors();
void PressureSensorResetAll();
void GetMS5806CoeffsAll();
void readAllSensors();
void updateCurrentPressures();
void reliefAllPstart();
void clearSerialPort0();
void handleSerialCommands();
void printStatusToSerial();
void runStateMachine();
void serviceNextChannelNonBlocking();

#endif