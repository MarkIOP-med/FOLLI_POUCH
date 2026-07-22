"""
POUCH Console - Flask Backend
Manages serial communication with ESP32/Mega
"""
import serial
import threading
import time
from datetime import datetime
from queue import Queue
from flask import Flask, jsonify, request
from flask_cors import CORS
import csv
import io

app = Flask(__name__)
CORS(app)

# Configuration
SERIAL_PORT = "COM3"  # Change to your port (COM3, /dev/ttyUSB0, etc.)
BAUD_RATE = 9600
TIMEOUT = 1

# Global state
device_state = {
    "connected": False,
    "connection_time": None,
    "device_port": SERIAL_PORT,
    "last_telemetry": {},
    "error": None
}

serial_connection = None
telemetry_queue = Queue(maxsize=10)
command_queue = Queue()


class SerialManager:
    """Handles ESP32 serial communication"""
    
    def __init__(self, port, baudrate=9600):
        self.port = port
        self.baudrate = baudrate
        self.ser = None
        self.running = False
        self.thread = None
        
    def connect(self):
        """Open serial connection"""
        try:
            self.ser = serial.Serial(self.port, self.baudrate, timeout=TIMEOUT)
            self.running = True
            device_state["connected"] = True
            device_state["connection_time"] = datetime.now().isoformat()
            device_state["error"] = None
            
            # Start background thread for reading
            self.thread = threading.Thread(target=self._read_loop, daemon=True)
            self.thread.start()
            print(f"✓ Connected to {self.port} at {self.baudrate} baud")
            return True
        except Exception as e:
            device_state["error"] = str(e)
            device_state["connected"] = False
            print(f"✗ Failed to connect: {e}")
            return False
    
    def disconnect(self):
        """Close serial connection"""
        self.running = False
        if self.ser and self.ser.is_open:
            self.ser.close()
        device_state["connected"] = False
        print("Disconnected from device")
    
    def _read_loop(self):
        """Background thread: read telemetry from device"""
        buffer = ""
        while self.running and self.ser and self.ser.is_open:
            try:
                if self.ser.in_waiting:
                    char = self.ser.read(1).decode('utf-8', errors='ignore')
                    buffer += char
                    
                    # Process complete lines
                    if char == '\n':
                        line = buffer.strip()
                        if line:
                            self._handle_telemetry_line(line)
                        buffer = ""
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"Serial read error: {e}")
                self.running = False
    
    def _handle_telemetry_line(self, line):
        """Parse telemetry CSV line"""
        try:
            # CSV format: time, target_ch1, target_ch2, target_ch3, target_ch4, 
            #             actual_ch1, actual_ch2, actual_ch3, actual_ch4, 
            #             manifold_pressure, fsr1, fsr2, fsr3, fsr4, fsr5, fsr6, fsr7, fsr8
            
            fields = line.split(',')
            if len(fields) >= 10:
                telemetry = {
                    "timestamp": datetime.now().isoformat(),
                    "time": fields[0],
                    "target": [int(fields[1]), int(fields[2]), int(fields[3]), int(fields[4])],
                    "actual": [int(fields[5]), int(fields[6]), int(fields[7]), int(fields[8])],
                    "manifold": int(fields[9]) if len(fields) > 9 else 0,
                    "fsr": [float(fields[i]) if len(fields) > i else 0 for i in range(10, 18)]
                }
                device_state["last_telemetry"] = telemetry
                
                # Keep telemetry queue small
                if telemetry_queue.full():
                    telemetry_queue.get()
                telemetry_queue.put(telemetry)
        except Exception as e:
            print(f"Telemetry parse error: {e}")
    
    def send_command(self, command):
        """Send command to device"""
        try:
            if self.ser and self.ser.is_open:
                self.ser.write((command + '\n').encode('utf-8'))
                self.ser.flush()
                print(f"→ Sent: {command}")
                return True
        except Exception as e:
            print(f"Send error: {e}")
        return False


# Initialize serial manager
serial_mgr = SerialManager(SERIAL_PORT, BAUD_RATE)


# ============ API Routes ============

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get device connection status"""
    return jsonify(device_state)


@app.route('/api/connect', methods=['POST'])
def connect_device():
    """Attempt to connect to device"""
    global serial_mgr
    
    port = request.json.get('port', SERIAL_PORT)
    if serial_mgr.connect():
        return jsonify({"success": True, "message": "Connected"}), 200
    else:
        return jsonify({"success": False, "error": device_state["error"]}), 400


@app.route('/api/disconnect', methods=['POST'])
def disconnect_device():
    """Disconnect from device"""
    serial_mgr.disconnect()
    return jsonify({"success": True})


@app.route('/api/telemetry', methods=['GET'])
def get_telemetry():
    """Get latest telemetry data"""
    return jsonify(device_state.get("last_telemetry", {}))


@app.route('/api/command', methods=['POST'])
def send_command():
    """Send command to device"""
    data = request.json
    command = data.get('command', '')
    
    if not command:
        return jsonify({"error": "No command provided"}), 400
    
    # Validate command format
    if _validate_command(command):
        if serial_mgr.send_command(command):
            return jsonify({"success": True, "command": command}), 200
        else:
            return jsonify({"error": "Failed to send command"}), 500
    else:
        return jsonify({"error": "Invalid command format"}), 400


@app.route('/api/commands/start', methods=['POST'])
def cmd_start():
    """START button - set all channels to target"""
    data = request.json
    targets = data.get('targets', [100, 100, 100, 100])
    commands = [f"{i},{targets[i]}" for i in range(4)]
    cmd = ";".join(commands)
    return send_command_helper(cmd)


@app.route('/api/commands/stop', methods=['POST'])
def cmd_stop():
    """STOP button"""
    return send_command_helper("s")


@app.route('/api/commands/emergency', methods=['POST'])
def cmd_emergency():
    """Emergency relief"""
    return send_command_helper("emergency")


@app.route('/api/commands/vibration', methods=['POST'])
def cmd_vibration():
    """Set vibration levels"""
    data = request.json
    levels = data.get('levels', [0, 0, 0, 0])  # ch0, ch1, ch2, ch3
    cmd = f"vib:{','.join(map(str, levels))}"
    return send_command_helper(cmd)


# Helper functions

def send_command_helper(cmd):
    """Helper to send command and return response"""
    if serial_mgr.send_command(cmd):
        return jsonify({"success": True, "command": cmd}), 200
    else:
        return jsonify({"error": "Failed to send"}), 500


def _validate_command(cmd):
    """Validate command format"""
    # Simple validation: X,Y or X1,Y1;X2,Y2 or 's' or 'r' or 'emergency' or 'vib:...'
    if cmd in ['s', 'r', 'emergency']:
        return True
    if cmd.startswith('vib:'):
        return True
    # Check X,Y format
    if ',' in cmd:
        return True
    return False


@app.route('/')
def index():
    """Serve the dashboard UI"""
    return app.send_static_file('index.html')


@app.route('/static/<path:path>')
def send_static(path):
    """Serve static files"""
    return app.send_static_file(path)


# ============ Error handlers ============

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Server error"}), 500


# ============ Startup/Shutdown ============

@app.before_request
def before_request():
    """Called before each request"""
    pass


@app.teardown_appcontext
def teardown(e):
    """Cleanup on shutdown"""
    if e is not None:
        print(f"App error: {e}")


if __name__ == '__main__':
    print("=" * 50)
    print("POUCH Console - Web Backend")
    print("=" * 50)
    
    # Try to connect on startup
    if not serial_mgr.connect():
        print(f"⚠ Could not connect to {SERIAL_PORT}")
        print("  You can connect manually from the UI")
    
    print("\n📱 Opening http://localhost:5000")
    print("Press Ctrl+C to stop\n")
    
    try:
        app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)
    except KeyboardInterrupt:
        print("\nShutting down...")
        serial_mgr.disconnect()
