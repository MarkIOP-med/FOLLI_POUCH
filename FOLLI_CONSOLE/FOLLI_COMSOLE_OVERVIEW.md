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

## 3. BLE Protocol

**The wire protocol is the Gen4 text grammar — `POUCH_ESP_GEN4/POUCH_ESP.md` is the
source of truth.** The 4-byte command / 6-byte telemetry binary protocol that used to
be specified here was retired on 2026-08-21; the same GATT endpoints now carry the
identical text lines the USB-serial admin app uses, so the pouch behaves the same no
matter which transport is talking.

* **Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
* **Command characteristic** `beb5483e-36e1-4688-b7f5-ea07361b26a8` (write /
  write-no-response): one UTF-8 command line per write (`start`, `stop`,
  `setpressure:1,55`, `setvibration:-1,2,-1,-1`, `readuser`, ...). The console uses
  write-WITH-response so commands longer than one ATT packet reassemble.
* **Telemetry characteristic** `d68a2a54-7f15-4ba5-bc44-59368d400d3b` (notify): one
  text line per notify — the periodic enriched frame
  `T:<state>,<elapsed_s>,<a0..a3>,<t0..t3>,<batt>,<err>,<vibR0..vibR3>` every 250 ms
  (16 fields; `vibR0..vibR3` = each zone's OWN massage countdown in seconds,
  FRONT/TEMPLE/EAR/BACK, independent per zone — the console shows the selected
  zone's, matching the operator app's per-zone timers), plus the tagged
  `OK:` / `ERR:` / `R:` responses to commands this client sent. A 13-field frame
  (the old single `vibRemainingS`) is rejected as malformed, so a stale console
  gets no telemetry against new firmware — install the APK before flashing.
* **MTU:** the enriched frame is ~65 bytes — the client MUST negotiate a larger MTU
  (the console requests 185) or notifies arrive truncated; BLE has no long-notify
  reassembly. Battery and the error flag are firmware stubs today.
* **State mirroring:** state + session clock in every frame is what lets this console
  and the serial admin app mirror each other — whoever starts or stops a session,
  both UIs flip together and show the same elapsed time.
* **Patient identity:** the pouch's user record (`R:USER:<id>,<assigned>,<p0..p3>,<name>`)
  is the console's prescription AND its "Patient:" line. The operator app checks a
  patient out to the pouch the moment they are selected (`user:<id>:<regime>:<name>`),
  and the firmware announces the new record to this console unprompted, so both UIs
  show the same person at once. The record is RAM-only on the board: after a
  power-cycle it is *unassigned* — the console then shows "not assigned", keeps every
  zone inert and withholds START (the firmware refuses a console START in that state
  too) until the operator selects a patient again. A zone prescribed above the 70 mmHg
  patient ceiling is shown at its true value but locked from trimming.
* **Conformance:** the console implementation (`src/services/pouch/protocol.ts`), the
  admin app's Python mirror and the firmware are held together by
  `shared/protocol-vectors.json`, run by both test suites.

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