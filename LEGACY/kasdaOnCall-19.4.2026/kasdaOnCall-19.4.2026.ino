
#include <Arduino.h>
#include <math.h>
#include <Wire.h>


int cellToChangeFromSerial = 0;
int newPressureFromSerial = 0;

int cellTargetPressure[4] = { 0, 0, 0, 0 };                      //Target output pressure in mmHG FOR PUMPS & VALVES
int vibrationData[8] = { 30, 100, 255, 150, 66, 125, 200, 77 };  // up to 255                                       // Calculated pressure from the regulator’s sample/output port, in mmHG
int valvePins[9] = { 22, 23, 24, 25, 26, 27, 28, 29, 30 };
int compressorPins[5] = { 31, 32, 33, 34, 35 };  // includ spare pin
int vibrationPins[8] = { 2, 3, 4, 5, 6, 7, 8, 9 };

int fsrPins[8] = { A0, A1, A2, A3, A4, A5, A6, A7 };
int fsrData[8];
int maxDef = 4;  // max def pressure (cellTargetPressure- pressure)
#define pumpSensor 4
#define pumpPin 8      // pin in valvePins[i]
#define valveRelief 6  //pin in valvePins[i]
bool pumping=0,draining=0;
#define num_of_sensors 5
#define sen0 40
#define sen1 41
#define sen2 42
#define sen3 43
#define sen4 44
#define Device_Address 0x76
unsigned int cof_arr[num_of_sensors][6];  // SENs, OFF, TCS,TCO,Tref,TEMPSENS
unsigned char cof_control[6] = { 0xA2, 0xA4, 0xA6, 0xA8, 0xAA, 0xAC };
unsigned long Press_raw[num_of_sensors], Temp_raw[num_of_sensors];
float dT[num_of_sensors], p[num_of_sensors], tt[num_of_sensors], p_start[num_of_sensors];

long t = 0, t1 = 0;
String label_coef = "SEN,OFF,TCS,TCO,Tref,TEMPSENS";
String tmp_string;
unsigned char u, c;  //u=data file #  c=coef file #
void setup() {
  int i;
  initValveCompressorVibration();
  Serial.begin(9600);
  Serial.println("Hi there");
  Wire.begin();
  init_sensors();
  PressureSensorResetAll();
  GetMS5806CoeffsAll();
  //write_coef();
  reliefAllPstart();
  clearSerialPort0();
  line_to_pc();
  Serial.println("\n\n   Wait for data from Serial\n");
}

void loop() {
  line_to_pc_Pstart();
  checkSerial();
  delay(1000);
}
