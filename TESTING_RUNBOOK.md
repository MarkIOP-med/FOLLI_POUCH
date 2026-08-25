# FOLLISAVE — End‑to‑End Testing Runbook (first‑time setup)

This is a follow‑every‑line guide to run the **whole** system at home:
the operator web app (PC), the ESP32 pouch (USB to PC), and the patient
console app (Android phone, talks to the pouch over Bluetooth). It assumes you
have **never** run it before.

> **Read the topology once — it explains every step below.**
>
> ```
>   ESP32 pouch  ──USB (COM port)──►  PC ──► Backend (:8000) ──► Web app (:5173)   ← you drive here
>        ▲                                                                          
>        └────────────── Bluetooth LE ──────────────►  Android phone (Console app)  ← patient drives here
>
>   Android phone ──USB──► PC   ← ONLY to build/reload the app. Control is always over Bluetooth.
> ```
>
> The PC talks to the pouch over the **USB serial** cable. The phone talks to the
> pouch over **Bluetooth**. They run **at the same time** — that is the whole point:
> whoever starts or stops a session, both screens follow each other.

You will need **three terminal windows** open on the PC the whole time
(Backend, Frontend, and the Console's Metro bundler). Don't close them.

---

## 0. One‑time prerequisites (install these once)

| Tool | Version | Check with | Notes |
|---|---|---|---|
| **Git** | any recent | `git --version` | to pull the code |
| **Python** | 3.11 or 3.12 | `python --version` | for the backend |
| **Node.js** | **20 or newer** | `node --version` | for the web app **and** the phone app |
| **Java JDK** | **17** | `java -version` | needed to build the Android app |
| **Android SDK + platform‑tools** | current | `adb --version` | comes with Android Studio; gives you `adb` |
| **Silicon Labs CP210x driver** | latest | see below | so the ESP32 shows up as a COM port |

**CP210x USB‑to‑UART driver** (the ESP32 uses a CP2102 chip): if the board does
**not** appear as a `COM` port in Windows Device Manager when you plug it in,
install "CP210x Universal Windows Driver" from Silicon Labs, then re‑plug the
board. (On this bench we already installed it once; a fresh PC needs it.)

> If installing the full Android toolchain (JDK + SDK) is more than you want to
> do right now, see **FAQ → "I don't want to install Android Studio"** for the
> pre‑built‑APK shortcut.

---

## 1. Get the code

Open a terminal (PowerShell) where you keep projects:

```powershell
git clone https://github.com/MarkIOP-med/FOLLI_POUCH.git
cd FOLLI_POUCH
```

If you already have the folder, just update it:

```powershell
cd FOLLI_POUCH
git checkout main
git pull
```

You should be on `main` at the latest commit (`git log --oneline -1` shows
"Operator app mirrors a console‑started session …" or newer).

The **firmware on the ESP32 is already the latest** — it was flashed before the
rig was handed over, so you do **not** need to flash anything. (If you ever do,
see **Appendix A**.)

---

## 2. Connect and power the pouch hardware

Do this before starting the backend.

1. **Plug the ESP32 into the PC by USB.** This powers the board's logic and
   creates the COM port. Note which `COM` number it is (Device Manager →
   *Ports (COM & LPT)* → "Silicon Labs CP210x… (COMx)"). You'll need `COMx`.
2. **Turn on the bench actuator power supply** (the one that drives the pump,
   valves and relief). The ESP alone can't inflate anything.
3. **Flip the pump's manual ON switch.** *If you forget this, nothing inflates —
   this is the single most common "it doesn't work".*
4. Put a balloon on **TEMPLE** and **EAR**. On this bench only those two zones
   inflate — **FRONT and BACK valves are physically dead** (known hardware
   limitation, not a bug). One FLOW‑LINK side (its FSR/force sensors and its
   vibration motors) is also dead.

> **Serial reset caveat:** every time the PC *opens* the COM port, the ESP32
> reboots and takes about **6 seconds** before it answers. That's normal — just
> wait after you press *Connect* later.

---

## 3. Start the Backend (Terminal #1)

```powershell
cd FOLLI_POUCH\POUCH_APP\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Leave it running. On first run it creates a fresh database (`folli.db`) and
seeds a "Mock Pouch" so the app is usable even with no hardware.

**Verify it's up:** open a browser to **http://127.0.0.1:8000/api/health** —
you should see `{"ok":true}`.

> The database starts **empty of patients**, and knows only the seeded *Mock
> Pouch*. In steps 5–6 you'll add your real pouch and create a patient.

---

## 4. Start the Frontend / web app (Terminal #2)

```powershell
cd FOLLI_POUCH\POUCH_APP\frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. This is the **operator app**.
It talks to the backend automatically (it proxies to port 8000 — so the backend
must be running first).

You'll land on the **Home** screen showing a *Mock Pouch* card.

---

## 5. Register your real pouch and connect it

1. In the web app, open **Admin** (the gear / admin area).
2. Find the **Devices** section → **Add device**:
   * **ID:** anything short, e.g. `POUCH1`
   * **Label:** e.g. `Bench pouch`
   * **Transport:** `serial`
   * **Port:** pick your `COMx` from the list (the CP2102 port is starred ★).
   * Save/Add.
3. Go back to **Home**. Your new pouch card appears.
4. Click **ENTER** on it. The app connects over serial — remember the ~6 s
   reset, so give it a few seconds. It then opens the **Diagnostics** screen.

**Verify:** the status shows **Connected**, and the telemetry rate is a live
number (a few Hz), not 0. Pressures read ~0 while idle.

> You can now delete the *Mock Pouch* card if you want it out of the way — once
> a real device exists, the mock won't reappear on restart.

---

## 6. Create a patient (balloon‑safe)

The patient console can only run a **clinician‑assigned** patient, so create one.

1. Open **Users** (patients).
2. **Create patient:**
   * **Full name:** e.g. `Bench Test`
   * **National ID:** *leave blank* for testing. (If you type one it must be a
     valid Israeli ID or it's rejected — blank avoids that.)
   * **Prescription (regime):** use only the two working zones (FRONT and BACK
     are dead on this bench). The pressure **ceiling is 130 mmHg**, so you can
     prescribe up to **125 directly** with nothing to change — e.g.
     **TEMPLE = 90, EAR = 125**, or gentler **TEMPLE = 40, EAR = 40** if you'd
     rather start soft. Keep **FRONT = 0, BACK = 0**.
   * Optionally set a **massage/vibration level** per zone (1–3).
   * Save.

> **About the 130 ceiling and human safety:** the ceiling ships at **130 mmHg**
> so a full 125 regime works out of the box — that's why you don't need to touch
> any setting. It also means the patient console will let a patient dial a zone
> high. **130 is a bench value.** Before anything is ever worn on a person's head,
> lower the ceiling to **70** in **Admin → Settings → Max pressure**.

---

## 7. Get the Console app onto the phone (Terminal #3)

### 7a. Prepare the phone (one time)
1. **Settings → About phone →** tap **Build number** seven times to unlock
   *Developer options*.
2. **Settings → Developer options →** turn on **USB debugging**.
3. Turn on **Bluetooth**. Keep the phone **unlocked** while building.
4. Plug the phone into the PC by USB.
5. In a terminal run `adb devices`. The phone should be listed as `device`.
   If it says **`unauthorized`**, look at the phone: tap **Allow** on the
   *"Allow USB debugging?"* pop‑up (tick "always allow from this computer").

### 7b. Build and install the app
```powershell
cd FOLLI_POUCH\FOLLI_CONSOLE
npm install
npm run android
```

* This auto‑syncs the shared artwork, builds the app, installs it on the phone,
  and launches it. **The first build takes ~5–15 minutes** (later ones are fast).
* It also starts **Metro** (the JS bundler) in this terminal — **leave it
  running** while you test. If you close it, the app shows a red error screen.
* When Android asks for **Bluetooth / "Nearby devices"** permission, tap
  **Allow** — the app can't scan for the pouch without it.

> Two harmless red boxes may flash on first launch ("ExpoNavigationBar…",
> "ExpoKeepAwake…" — kiosk niceties the dev build can't do). Dismiss them; they
> don't affect anything.

### 7c. Confirm it's connected over Bluetooth
Look at the **top status bar of the Console app**:
* **"Connected"** (green) = the phone found and joined the pouch over Bluetooth. ✅
* **"Disconnected"** (red) = not linked yet. The app **retries every few
  seconds by itself** — give it ~10 s. If it stays red, see the FAQ.

You should also see the **patient's name** you created (because selecting/creating
the patient checked them out to the pouch, and the console mirrors that).

> **The web app (serial) and the phone (Bluetooth) are connected to the pouch at
> the same time.** That's expected and required — they don't conflict.

---

## 8. The end‑to‑end tests

Keep the web app (Diagnostics screen for your pouch) and the phone side by side.

### Test A — Operator starts, phone mirrors it
1. On the **web app**, make sure your patient is **selected** (the console
   should already show their name).
2. Press **START** on the web app.
3. **Watch:** the pump runs; the **TEMPLE and EAR balloons inflate** to their
   prescribed pressures and hold.
4. **On the phone, without touching it:** the console flips to **ACTIVE**, shows
   a **running clock**, a **STOP** button, and the live pressures — the *same*
   session, the *same* clock as the web app.

✅ **Pass =** balloons hold ~40; both screens show ACTIVE with the same clock and
the same targets; the patient name shows on both.

### Test B — Phone starts, operator adopts it
1. Press **STOP** first if a session is running (web STOP, or hold the phone's
   STOP ~1.5 s). Wait for the balloons to empty.
2. On the **phone**, press **START**.
3. **Watch:** balloons inflate again; **on the web app** a session appears on its
   own, showing the **device clock** and the real **targets**, with a
   **"started from the patient console"** note.

✅ **Pass =** the web app shows the running session it did *not* start, with the
correct clock and targets (not zeros), and the patient's name.

### Test C — Trim, massage, and cross‑stop
* **Trim a zone:** on the phone (or web), change one zone's pressure a little and
  press **SET**. Only that zone's target changes — on **both** screens.
* **Massage:** tap a zone's massage level and its **SET/▶** — the motor runs one
  burst (~20 s) and stops on its own; other zones keep running.
* **Stop from the phone during an operator session:** press START on the web,
  then **hold STOP on the phone**. The balloons vent, and the **web app shows
  "stopped from the patient console."**

✅ **Pass =** every change on one side shows up on the other within a second or
two; STOP always empties the balloons.

> **Venting takes a moment.** STOP uses a pulsed vent (burst → settle → measure)
> and can take up to ~15 s to fully empty a stiff balloon. Wait for it to finish
> before starting again — don't stack a new START on a half‑full load.

---

## 9. Shut down cleanly

1. **STOP** any running session (from either screen) and let the balloons empty.
2. Close the phone app (Metro terminal can be Ctrl‑C'd).
3. In the web app you can **Disconnect** the pouch (or just close the tab).
4. Ctrl‑C the **Frontend** terminal, then the **Backend** terminal.
5. Turn off the pump switch and the bench power. Unplug USB.

---

## 10. FAQ / troubleshooting (fixes you can apply mid‑test)

**The pouch board doesn't appear as a COM port.**
Install the Silicon Labs CP210x driver (§0), re‑plug the board, re‑check Device
Manager → *Ports (COM & LPT)*.

**Backend won't open the port — "Access is denied" / "could not open COMx".**
Something else already holds the port. Close the Arduino IDE **Serial Monitor**,
any second backend window, or `arduino-cli` upload. Only one program can own the
COM port. Then press **Connect** again. (Also remember the ~6 s reset after
connect — the rate is 0 for a few seconds, that's normal.)

**I pressed START but nothing inflates.**
99% of the time: the **pump's manual ON switch is off**, or the **bench power
supply is off**. Check both. Also confirm you put the balloons on **TEMPLE/EAR**
— FRONT and BACK valves are dead on this bench.

**Only two balloons ever inflate.**
Correct — **valves 0 (FRONT) and 3 (BACK) are physically dead**. Test on
**TEMPLE** and **EAR** only.

**Web app can't reach the backend / pressures never load.**
The backend must be running first. Check **http://127.0.0.1:8000/api/health**
returns `{"ok":true}`. If not, look at Terminal #1 for the error. The web app
proxies `/api` to port 8000 — don't change the port.

**Console app shows "Disconnected" and won't connect.**
In order: (1) is the **pouch powered** (USB in, board's LED on)? (2) is the
phone's **Bluetooth ON** and the app's **Nearby‑devices/Bluetooth permission
granted**? (3) walk the phone closer. (4) Power‑cycle the pouch (unplug/replug
USB, wait ~10 s) — the app auto‑reconnects. The app already retries every ~4 s,
so you rarely need to restart it.

**Console shows "Timed out scanning for FOLLI pouch" (in the build logs).**
The phone can't see the board advertising. Same checklist as above. Also make
sure **no other device already grabbed the pouch's one Bluetooth slot** (e.g. a
second phone, or a BLE scanner app). Only one Bluetooth central can connect at a
time — the PC uses the **serial** cable, not Bluetooth, so it never competes.

**Console shows "Patient: not assigned" and a default pressure.**
No patient is checked out to the board (the board forgets on every power‑cycle —
the record lives in RAM only). Go to the web app, **select your patient** (or
create one). The console updates within a second, and START becomes available.

**`adb devices` says `unauthorized`.**
On the phone, tap **Allow** on the "Allow USB debugging?" pop‑up (tick "always
allow from this computer"). If no pop‑up shows: **Developer options → USB
debugging** off then on, keep the phone **unlocked**, re‑plug USB. Then re‑run
`adb devices` until it says `device`.

**`npm run android` fails with "device not found" / a device name error.**
Just have **one** phone plugged in and run `npm run android` (don't pass a
`--device <serial>` flag). If it still fails, run `adb kill-server; adb
start-server; adb devices` and make sure exactly one shows `device`.

**`npm run android` fails: "SDK location not found" / "JAVA_HOME" / Gradle.**
The Android toolchain isn't set up. Install **Android Studio** (gives the SDK
and platform‑tools) and **JDK 17**, then open a new terminal so the env vars
load, and retry. Or use the APK shortcut below.

**I don't want to install Android Studio / JDK just to test.**
Ask for a **pre‑built APK**: someone with the toolchain runs the build once and
sends you `app-release.apk` (or `app-debug.apk`). You then just copy it to the
phone and tap it to install (enable "install from unknown sources" once). A
**release** APK runs standalone — no PC, no Metro needed. (A **debug** APK still
needs the Metro bundler running on a PC on the same Wi‑Fi.)

**The phone app shows a full red error screen after it was working.**
The **Metro** terminal (Terminal #3) was closed or crashed. Restart it:
`cd FOLLI_CONSOLE; npm start`, then reload the app (shake the phone → *Reload*,
or press `r` in the Metro terminal).

**Balloons stay inflated after STOP.**
Give it up to ~15 s — the vent is pulsed and a stiff balloon drains slowly. If
they truly stay hard after that, press **STOP** again; if it persists, cut the
pump power switch and tell us (that would be a real fault to look at).

**The runtime clock or targets read 0 in the web app during a phone‑started
session.**
That was a bug we fixed — make sure you pulled the latest `main` (§1). After
pulling, restart the backend (Ctrl‑C, re‑run uvicorn) and reload the web page.

**I changed some code — how do I pick it up?**
Backend: Ctrl‑C and re‑run uvicorn. Frontend: it hot‑reloads (Vite); if odd,
refresh the page. Console: it hot‑reloads via Metro; for native/asset changes
re‑run `npm run android`.

**Everything is weird — how do I reset the app data?**
Stop the backend, delete `POUCH_APP\backend\folli.db` (and `folli.db-shm` /
`folli.db-wal` if present), restart the backend. You'll get a clean database
(re‑seeds the Mock Pouch; you'll re‑add your device and patient).

---

## Appendix A — Reflashing the firmware (only if asked)

The board already runs the latest firmware. If you ever need to reflash
(`arduino-cli` with the ESP32 core and `NimBLE-Arduino` library installed):

```powershell
cd FOLLI_POUCH\POUCH_ESP_GEN4
arduino-cli compile --fqbn esp32:esp32:esp32 .
# Close the backend first (release the COM port), then:
arduino-cli upload -p COMx --fqbn esp32:esp32:esp32 .
```

Baud is **9600** if you open a serial monitor. After flashing, the board comes
up **unassigned** (no patient) — that's expected; assign one from the web app.

## Appendix B — Fast restart (after the first full setup)

Once everything is installed, a normal test session is just:

1. Plug in the ESP (USB), turn on bench power + pump switch, balloons on TEMPLE/EAR.
2. **Terminal #1:** `cd POUCH_APP\backend; .\.venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --port 8000`
3. **Terminal #2:** `cd POUCH_APP\frontend; npm run dev` → open http://localhost:5173 → **ENTER** your pouch.
4. Plug in the phone (USB). **Terminal #3:** `cd FOLLI_CONSOLE; npm start` then press **`a`** to launch the app (or just open the already‑installed app and keep Metro running).
5. Select your patient in the web app → run Tests A/B/C.

---

*Questions or something doesn't match what you see? Note the exact screen/message
and send it over — most issues are one of the FAQ items above.*
