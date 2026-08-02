# FOLLI Comfort Console - System Architecture & Protocol Specification

**Hardware Baseline:** Poco C71 Smartphone (Client/Master) <-> ESP32-WROOM-32 (Peripheral/Slave)
**Communication Link:** Bluetooth 5.2 Low Energy (BLE)

---

## 1. System Overview
The FOLLI Comfort Console relies on a split-architecture layout. The user interface layer runs entirely on a dedicated Android smartphone (Poco C71), which communicates wirelessly over BLE with an ESP32-WROOM-32 microcontroller located inside the pouch control unit. The ESP32 directly drives the pneumatic control loops and vibration haptics based on inputs sent from the application.

---

## 2. Hardware Topology & Physical Boundaries

### A. Client Unit: Poco C71 Smartphone
* **Display UI:** 6.88-inch capacitive screen with wet-touch optimization.
* **Connectivity:** Bluetooth 5.2 (LE configuration).
* **Power Source:** Internal 5200mAh battery.

### B. Control Unit: ESP32-WROOM-32
* **Framework:** Arduino IDE / ESP-IDF utilizing the **NimBLE** library (`esp-nimble-cpp`).
* **Role:** BLE Peripheral / GATT Server.

### C. Physical Umbilical Link (FOLLI Flow Connector)
* **Pneumatics:** 4 x Pneumatic tubes (Outer Diameter = 2mm each).
* **Electrical Core:** Centralized 5mm OD circular channel housing a 10-pin or 12-pin layout (Omnetics Micro/Nano 360 series or micro dual-row 0.8mm pitch headers).

---

## 3. BLE GATT Profile Architecture
The system utilizes a single custom GATT Service over a secure, bonded Bluetooth channel.

* **FOLLI Custom Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`

### Characteristic A: Command Channel
* **UUID:** `beb5483e-36e1-4688-b7f5-ea07361b26a8`
* **Properties:** `WRITE_ONLY` or `WRITE_NO_RESPONSE`
* **Payload Size:** 4-Byte Array
* **Data Mapping:**
  * **Byte 0 (Target V-Node):** 
    * `0x01` = Forehead
    * `0x02` = Left Temple
    * `0x03` = Right Temple
    * `0x04` = Back of Head
  * **Byte 1 (Target Pressure):** `0x00` to `0x46` (maps directly to 0 to 70 mmHg)
  * **Byte 2 (Massage Level):**
    * `0x00` = Off
    * `0x01` = Low Speed
    * `0x02` = Medium Speed
    * `0x03` = High Speed
  * **Byte 3 (Operation Mode Trigger):**
    * `0x00` = Hard Emergency System Shutoff / Dump Pressure
    * `0x01` = Static Hold Mode (apply Byte 1 pressure + Byte 2 massage level to the Byte 0 V-Node)
    * `0x02` = Dynamic Burst / Pulse Mode — **not implemented on the firmware side yet**, ignored if sent
    * `0x03` = Restore — recall last-set pressures for all 4 V-Nodes (Bytes 0-2 ignored)
    * `0x04` = Reset — recall factory-default pressures for all 4 V-Nodes (Bytes 0-2 ignored)
    * `0x05` = Device Off — vent all + stop vibration + halt (Bytes 0-2 ignored)
    * `0x06` = Device On — resume from Device Off (Bytes 0-2 ignored)
    * `0x03`-`0x06` are firmware extensions beyond the original spec, added to cover system-level actions (restore/reset/on-off) that the original physical keyboard supported. See `POUCH_ESP_GEN4/ble.ino`.

* **V-Node byte note:** the firmware maps this positionally onto its 4 real pads — `0x01`=FRONT, `0x02`=TEMPLE, `0x03`=EAR, `0x04`=BACK. There is no split Left/Right Temple channel; the "Left Temple"/"Right Temple" labels above predate the EAR pad and should be read as position 2 and 3 respectively.

### Characteristic B: Live Telemetry Channel
* **UUID:** `d68a2a54-7f15-4ba5-bc44-59368d400d3b`
* **Properties:** `NOTIFY` (Pushed automatically by ESP32 every 250 milliseconds)
* **Payload Size:** 6-Byte Array
* **Data Mapping:**
  * **Byte 0:** Real-time reading from Forehead pressure sensor (mmHg)
  * **Byte 1:** Real-time reading from Left Temple pressure sensor (mmHg)
  * **Byte 2:** Real-time reading from Right Temple pressure sensor (mmHg)
  * **Byte 3:** Real-time reading from Back pressure sensor (mmHg)
  * **Byte 4:** Control Unit Battery State of Charge (%)
  * **Byte 5 (System Error Flag):**
    * `0x00` = System Healthy / Normal Operation
    * `0x01` = Critical Pressure Leak Detected
    * `0x02` = Over-temperature condition warning

---

## 4. UI/UX Visual Layout Specifications

### Global Styling & Theme
* **Background:** Deep, dark blue-grey linear gradient (`#010813` top to `#050e1d` bottom).
* **Structure:** Single vertical `Column` with `16dp` horizontal padding wrapped inside a non-scrolling `SafeArea`.
* **Card Container Style:** Components are nested inside dark, translucent rounded rectangles (`borderRadius: 16`) with a subtle blue border outline (`1px solid #1a2c42`).

### High-Fidelity Wireframe Block Hierarchy
```text
+--------------------------------------------------------+
| [🟢 ACTIVE]                 (13:12 min)    [⚙️ Settings] | -> Section 1: Header Row
+--------------------------------------------------------+
|                                                        |
|   +------------------------------------------------+   |
|   | Treatment Area                                 |   |
|   | **Temples**                  [ 3D Head Profile ]   | -> Section 2: 60/40 Split Row
|   | Session Status: Active       [  Glowing Node   ]   |
|   |                                                |   |
|   |  [🪞]      [🪞]       [🪞]      [🪞]            |   | -> Horizontal Icon Row
|   +------------------------------------------------+   |
|                                                        |
|   +------------------------------------------------+   |
|   | Pressure Control                               |   |
|   |                 **25** mmHg                    |   | -> Section 3: Readout + Slider
|   |    (—)  ====================O=========  (+)    |   |
|   |                    [ SET ]                     |   |
|   +------------------------------------------------+   |
|                                                        |
|   +------------------------------------------------+   |
|   | Massage Levels                                 |   | -> Section 4: Segmented Capsule
|   |     [  0  ]   [  1  ]   (( 2 ))   [  3  ]      |   |
|   +------------------------------------------------+   |
|                                                        |
|   +------------------------------------------------+   |
|   |                    **STOP**                    |   | -> Section 5: Gradient Button
|   +------------------------------------------------+   |
|               🛡️ Long press STOP to end session         |
+--------------------------------------------------------+