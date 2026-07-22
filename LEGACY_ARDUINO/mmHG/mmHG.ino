float rawData[6];
unsigned int avgNum=20, delayMeasure=25;
void setup() {
Serial.begin(9600);
}
void loop() {
readSensors();
printSensors(); 
delay(500);
}
void readSensors(){
  int i;
 for(i=0; i<6; i++)rawData[i]=0;
 for(int j=0; j<avgNum; j++){
  for(i=0; i<6; i++) rawData[i]=rawData[i]+ analogRead(i);
  delay(delayMeasure);  
 }
 for(i=0; i<6; i++) rawData[i]=rawData[i]/avgNum;
}
void printSensors(){
 int i;
 for(i=0; i<6; i++){
 Serial.print(rawData[i],0); Serial.print("  ,  ");  
 }
 Serial.println("");

}
