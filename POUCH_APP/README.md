# POUCH Console - Web Dashboard

A real-time web-based dashboard for monitoring and controlling the POUCH ESP32/Mega device via USB serial connection.

## Features

- **Real-time Telemetry Display**: Live pressure readings, FSR sensor data, and device status
- **Command Interface**: Send control commands directly to the device
- **V-Nodes Control**: Editable target pressure input for each pneumatic zone
- **Vibration Assignment**: Set vibration levels per zone with visual indicators
- **System Status**: Connection status, runtime clock, manifold pressure monitoring
- **Responsive Design**: Works on desktop browsers and can be accessed from mobile/tablet on the same network

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Serial Port

Edit `app.py` line 15:
```python
SERIAL_PORT = "COM3"  # Change to your ESP32/Mega port
```

Common ports:
- Windows: `COM1`, `COM3`, `COM4`, etc.
- Linux/Mac: `/dev/ttyUSB0`, `/dev/ttyACM0`, `/dev/cu.usbserial-*`

To find your port:
- **Windows**: Device Manager → Ports (COM & LPT)
- **Linux/Mac**: `ls /dev/tty*`

### 3. Run the Server

```bash
python app.py
```

You should see:
```
==================================================
POUCH Console - Web Backend
==================================================
✓ Connected to COM3 at 9600 baud
📱 Opening http://localhost:5000
Press Ctrl+C to stop
```

### 4. Open Dashboard

- **Local**: Open `http://localhost:5000` in your browser
- **From Tablet/Phone** (same WiFi): `http://<YOUR_PC_IP>:5000`
  - Find your PC IP: `ipconfig` (Windows) or `ifconfig` (Linux/Mac)

## Usage

### Control Commands

| Button | Action | Keyboard Shortcut |
|--------|--------|-------------------|
| **START** | Send all channels to target pressure | Ctrl+S |
| **STOP** | Stop all channels | Ctrl+X |
| **EMERGENCY** | Immediate relief valve activation | Ctrl+E |

### V-Nodes (Pressure Control)

1. Enter target pressure (0-200 mmHg) in the text field
2. Click **SET** to send to device
3. Monitor actual pressure below

### Vibration Assignment

- Click a level button (0-3) to activate that vibration level for the zone
- Active level is highlighted in green
- Inactive levels are grayed out

## Architecture

```
app.py
  ├── SerialManager          # Handles USB serial communication
  ├── Flask Routes           # API endpoints
  └── Background threads     # Read telemetry, process commands

static/
  ├── index.html            # Dashboard UI (mirrors SVG mockup)
  ├── app.js                # Frontend logic & API calls
  └── style.css             # Dark theme styling
```

## API Endpoints

### Status
- `GET /api/status` - Device connection status
- `POST /api/connect` - Connect to device
- `POST /api/disconnect` - Disconnect

### Telemetry
- `GET /api/telemetry` - Latest sensor data

### Commands
- `POST /api/command` - Send raw command
- `POST /api/commands/start` - START with targets
- `POST /api/commands/stop` - STOP all
- `POST /api/commands/emergency` - Emergency relief
- `POST /api/commands/vibration` - Set vibration levels

### Example API Call

```bash
# Send START command
curl -X POST http://localhost:5000/api/commands/start \
  -H "Content-Type: application/json" \
  -d '{"targets": [100, 100, 100, 100]}'

# Send individual channel command (Channel 0 → 120 mmHg)
curl -X POST http://localhost:5000/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "0,120"}'
```

## Command Protocol

The app sends commands in the format expected by the ESP32:

- `X,Y` - Channel X target pressure Y (e.g., `0,100`)
- `X1,Y1;X2,Y2;...` - Batch commands (e.g., `0,100;1,120;2,100;3,100`)
- `s` - Stop all channels
- `r` or `emergency` - Emergency relief
- `vib:L0,L1,L2,L3` - Set vibration levels

## Troubleshooting

### Device Not Connecting

1. Check serial port in `app.py`
2. Verify USB cable is connected
3. Confirm ESP32/Mega drivers are installed
4. Try a different USB port

### No Telemetry Data

1. Verify device is sending CSV telemetry (check with Arduino Serial Monitor)
2. Confirm baud rate is 9600
3. Check serial.ino in POUCH_ESP_GEN4 is running properly

### Can't Access from Another Device

1. Ensure both devices on same WiFi network
2. Check Windows Firewall allows Python on port 5000
3. Verify you're using the correct PC IP address

## Future Enhancements

- [ ] WebSocket real-time telemetry (currently polling)
- [ ] Data logging to CSV file
- [ ] Pressure/FSR graphs over time
- [ ] Session management and history
- [ ] User settings persistence
- [ ] Mobile app wrapper (Capacitor/Electron)
- [ ] BLE support for wireless ESP32 connection

## File Structure

```
POUCH_CONSOLE/
├── app.py                  # Flask backend (main)
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── static/
│   ├── index.html        # Dashboard HTML
│   ├── app.js            # Frontend JavaScript
│   └── style.css         # Styling
└── gui_mockups/          # Design reference
    └── complete_dashboard.svg
```

## License

Internal project - FOLLI_POUCH Team

## Support

Issues? Check the Arduino code in `POUCH_ESP_GEN4/` and verify serial communication first.
