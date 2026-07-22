/**
 * POUCH System Overview - Frontend Application
 * Real-time telemetry display and device control
 */

const API_BASE = '/api';
const TELEMETRY_INTERVAL = 500;
const STATUS_UPDATE_INTERVAL = 1000;

let appState = {
    connected: false,
    startTime: null,
    vibrationLevels: [1, 2, 3, 0],
    channelTargets: [100, 100, 100, 100]
};

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 POUCH System Overview loaded');
    setupEventListeners();
    setInterval(updateTime, 500);
    setInterval(fetchTelemetry, TELEMETRY_INTERVAL);
    setInterval(updateStatus, STATUS_UPDATE_INTERVAL);
    updateStatus();
});

// ============ Event Listeners ============

function setupEventListeners() {
    document.getElementById('btn-start').addEventListener('click', cmdStart);
    document.getElementById('btn-stop').addEventListener('click', cmdStop);
    document.getElementById('btn-pause').addEventListener('click', cmdPause);
}

// ============ API Communication ============

async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method: method,
            headers: {'Content-Type': 'application/json'}
        };
        if (data) options.body = JSON.stringify(data);
        
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const result = await response.json();
        if (!response.ok) console.error(`API Error: ${response.status}`, result);
        return result;
    } catch (error) {
        console.error('API call failed:', error);
        return { error: error.message };
    }
}

// ============ Device Commands ============

async function cmdStart() {
    console.log('→ START command');
    const result = await apiCall('/commands/start', 'POST', { targets: appState.channelTargets });
    if (result.success) {
        appState.startTime = Date.now();
        showNotification('START command sent', 'success');
    }
}

async function cmdStop() {
    console.log('→ STOP command');
    const result = await apiCall('/commands/stop', 'POST', {});
    if (result.success) showNotification('STOP command sent', 'success');
}

async function cmdPause() {
    console.log('→ PAUSE command');
    showNotification('PAUSE - (to implement)', 'info');
}

async function sendVNodeTarget(channel) {
    const targetValue = parseInt(document.getElementById(`target-${channel}`).value);
    if (isNaN(targetValue) || targetValue < 0 || targetValue > 200) {
        showNotification('Invalid target pressure', 'error');
        return;
    }
    const cmd = `${channel},${targetValue}`;
    const result = await apiCall('/command', 'POST', { command: cmd });
    if (result.success) {
        appState.channelTargets[channel] = targetValue;
        showNotification(`Ch${channel} → ${targetValue} mmHg`, 'success');
    }
}

async function setVibration(zone, level) {
    appState.vibrationLevels[zone] = level;
    updateVibrationButtons();
    const cmd = `vib:${appState.vibrationLevels.join(',')}`;
    const result = await apiCall('/command', 'POST', { command: cmd });
    if (result.success) {
        showNotification(`Vibration ${['FRONT', 'TEMPLE', 'EAR', 'BACK'][zone]} → Level ${level}`, 'success');
    }
}

// ============ UI Updates ============

async function updateStatus() {
    const status = await apiCall('/status', 'GET');
    if (status.connected !== appState.connected) {
        appState.connected = status.connected;
    }
    
    const indicator = document.getElementById('connection-text');
    if (status.connected) {
        indicator.textContent = `BLE: ● Connected (-62 dBm)`;
    } else {
        indicator.textContent = `BLE: ⚫ Disconnected`;
    }
}

async function fetchTelemetry() {
    const data = await apiCall('/telemetry', 'GET');
    if (!data || !data.timestamp) return;
    
    if (data.manifold !== undefined) {
        document.querySelector('.gauge text').textContent = data.manifold;
    }
    
    if (data.actual) {
        for (let i = 0; i < 4; i++) {
            document.getElementById(`actual-${i}`).textContent = `${data.actual[i]} mmHg`;
        }
    }
    
    if (data.fsr) {
        for (let i = 0; i < 8; i++) {
            const fsrValue = (data.fsr[i] / 100).toFixed(1);
            document.getElementById(`fsr-${i}`).textContent = `${fsrValue} N`;
        }
    }
}

function updateVibrationButtons() {
    const zones = ['FRONT', 'TEMPLE', 'EAR', 'BACK'];
    const table = document.querySelector('.vibration-table tbody');
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, zoneIdx) => {
        const buttons = row.querySelectorAll('.btn-level');
        buttons.forEach((btn, levelIdx) => {
            if (levelIdx === appState.vibrationLevels[zoneIdx]) {
                btn.classList.remove('btn-level-inactive');
                btn.classList.add('btn-level-active');
            } else {
                btn.classList.remove('btn-level-active');
                btn.classList.add('btn-level-inactive');
            }
        });
    });
}

function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('time-display').textContent = `LOCALIZED TIME: ${hours}:${minutes}:${seconds}`;
    
    if (appState.startTime) {
        const elapsed = Math.floor((Date.now() - appState.startTime) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        const runtimeText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        document.getElementById('session-runtime').textContent = `Session Runtime: ${runtimeText}`;
    }
}

// ============ Utilities ============

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

console.log('✓ App initialized');

