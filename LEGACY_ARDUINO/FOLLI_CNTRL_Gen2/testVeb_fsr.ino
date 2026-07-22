#include "config.h"

void printFsr(){
 Serial.println(""); 
 for(int k=0; k<6; k++){
  Serial.print(analogRead(fsrPins[k])); 
  Serial.print(" , ");
 }
 Serial.println(""); 
}
void testVeb(){
 for(int k=0; k<6; k++){
  analogWrite(vibrationPins[k],200);
  delay(3000);
  analogWrite(vibrationPins[k],0); 
 }
}
