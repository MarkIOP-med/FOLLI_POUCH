#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_SH110X.h>
#include <Adafruit_NeoPixel.h>

// ==================== TUNING PARAMETERS ====================
int PRESSURE_STEP_MMHG               = 5;   // mmHg per UP / DOWN key press
int PRESSURE_TOLERANCE_MMHG          = 3;   // ± tolerance for "at target"
int PRESSURE_ACTUATION_THRESHOLD_MMHG = 10; // min actual pressure to trigger valve actuation; below this a channel with target=0 is skipped
int VIBRATION_DURATION_MS     = 30000;  // ms vibration runs before auto-off (adjustable via side buttons)
int LONG_PRESS_MS             = 2000;   // ms hold for SIDE3 ON/OFF
int DISPLAY_UPDATE_INTERVAL   = 500;    // ms between OLED refreshes

// Sensor oversampling
const int overSampling       = 4;
const int overSamplingDelay  = 5;    // ms between oversampling cycles
const int sensorDelayMeasur  = 50;   // µs between sensors in one cycle

// Sensor conversion (3.3V supply, 0–100 kPa)
const float Vmin     = 0.2;
const float Vmax     = 2.7;
const float Pmax_kPa = 100.0;

// ==================== PRESSURE DEFAULTS ====================
// Order: FRONT=0, TEMPLE=1, EAR=2, BACK=3
int defaultPressure[4] = {0, 200, 0, 200};
int vibPWM[4]          = {0, 85, 170, 255};  // PWM for vib levels 0–3

// ==================== PINS — VALVES / PUMP / RELIEF ====================
const int valvePins[6] = {22, 23, 24, 25, 26, 27};
// valvePins[0] = pin 22  → FRONT PAD valve
// valvePins[1] = pin 23  → TEMPLE PAD valve
// valvePins[2] = pin 24  → EAR PAD valve
// valvePins[3] = pin 25  → BACK PAD valve
// valvePins[4] = pin 26  → RELIEF_PIN
// valvePins[5] = pin 27  → PUMP_PIN

#define RELIEF_PIN  valvePins[4]
#define PUMP_PIN    valvePins[5]

// ==================== PINS — PRESSURE SENSORS ====================
#define NUM_SENSORS  5
#define PUMP_SENSOR  4   // index of manifold sensor in p[] and analogPressureSensorPins[]

const int analogPressureSensorPins[NUM_SENSORS] = {A7, A8, A9, A10, A11};
// p[0]=A7  FRONT  p[1]=A8  TEMPLE  p[2]=A9  EAR  p[3]=A10  BACK  p[4]=A11  Manifold

// ==================== PINS — VIBRATION ====================
const int vibrationPins[6] = {2, 3, 4, 5, 6, 7};
// vibrationPins[0..3] map to FRONT, TEMPLE, EAR, BACK

// ==================== PINS — FSR ====================
const int fsrPins[6] = {A0, A1, A2, A3, A4, A5};

// ==================== DISPLAY ====================
// NOTE: DISPLAY_RESET set to -1 (no dedicated reset pin) because pin 34
// is used by the keyboard (KEY_BACK). SH1106G supports shared/no reset.
#define DISPLAY_RESET  -1
Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &Wire, DISPLAY_RESET);

// ==================== LEDS ====================
#define LED_PIN   19
#define NUM_LEDS  8

Adafruit_NeoPixel pixels(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// LED indices — VIB group: leds 0–3 (VIB_3 first), PAD group: leds 4–7 (FRONT first)
#define LED_FRONT   4   // Line 1: PAD selection
#define LED_TEMPLE  5
#define LED_EAR     6
#define LED_BACK    7
#define LED_VIB_0   3   // Line 3: vibration level
#define LED_VIB_1   2
#define LED_VIB_2   1
#define LED_VIB_3   0

struct Color { uint8_t r; uint8_t g; uint8_t b; };
const Color COLOR_OFF    = {0,   0,   0  };
const Color COLOR_GREEN  = {0,   150, 0  };
const Color COLOR_RED    = {150, 0,   0  };
const Color COLOR_BLUE   = {0,   0,   150};
const Color COLOR_YELLOW = {150, 150, 0  };
const Color COLOR_ORANGE = {150, 82,  0  };
const Color COLOR_WHITE  = {150, 150, 150};

// ==================== KEYBOARD ====================
#define NUM_KEYS  17
const int kbdPins[NUM_KEYS] = {44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 45, 46, 47};

// Key indices — Line 1: PAD selection
#define KEY_FRONT    0
#define KEY_TEMPLE   1
#define KEY_EAR      2
#define KEY_BACK     3
// Key indices — Line 2: pressure control
#define KEY_UP       4
#define KEY_ZERO     5
#define KEY_DOWN     6
// Key indices — Line 3: vibration level
#define KEY_VIB_0    7
#define KEY_VIB_1    8
#define KEY_VIB_2    9
#define KEY_VIB_3    10
// Key indices — Line 4: system commands
#define KEY_RESTORE  11
#define KEY_RESET    12
#define KEY_STOP     13
// Side buttons
#define KEY_SIDE_DOWN    14   // long press = ON/OFF
#define KEY_SIDE_MIDDLE  15   // TBD
#define KEY_SIDE_UP      16   // TBD

const unsigned long debounceDelay = 30;

bool kbdStatus[NUM_KEYS];
bool lastReading[NUM_KEYS];
unsigned long lastDebounceTime[NUM_KEYS];
bool kbdEventFlag  = false;
int  lastKeyPressed = -1;

// Long press state for SIDE3
unsigned long side3PressTime = 0;
bool side3Held      = false;
bool side3LongFired = false;

// ==================== STATE MACHINE ====================
enum SystemState {
  IDLE,
  PRESSURIZING,      // actively driving channels to targets
  MAINTENANCE,       // targets reached, holding pressures
  EMERGENCY_RELIEF,
  STOPPED
};
SystemState currentState = IDLE;

// ==================== GLOBAL STATE ====================
int   selectedPad             = -1;         // -1 = no PAD selected
int   targetPressure[4]       = {0, 0, 0, 0};
float currentPressure_gage[4] = {0.0};
float manifoldPressure_gage   = 0.0;
int   savedPressure[4];                     // initialized in setup() from defaultPressure
int           massageLevel[4]  = {0, 0, 0, 0};
unsigned long vibStartTime[4]  = {0, 0, 0, 0}; // millis() when vibration last started per PAD
bool  deviceOn                = true;

int   currentChannel          = 0;

float p[NUM_SENSORS];              // converted sensor readings (mmHg, before reference subtraction)
float referencePressure[NUM_SENSORS] = {0}; // baseline captured after startup/pre-action relief

// ==================== FUNCTION DECLARATIONS ====================
// pneumatics.ino
void initValves();
void reliefStartup();
void runStateMachine();
void updateChannels();
void reliefAllPads();
void resetChannelState();

// analogSensor.ino
void readAnalogSensors();
void updateCurrentPressures();
void captureReferencePressure();

// display.ino
void initDisplay();
void updateDisplay();

// serial.ino
void handleSerialCommands();
void clearSerialBuffer();
void printSerialLog();

// keyboard.ino
void initKeyboard();
void readKeyboard();
void handleKeyEvents();
void checkLongPress();

// leds.ino
void initLeds();
void updateLeds();
void setLed(int index, Color color);
void allLedsOff();

// vibration.ino
void initVibration();
void updateVibration();
void stopAllVibration();

#endif
