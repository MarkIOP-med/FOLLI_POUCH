/**
 * In-memory pouch simulation speaking the REAL text grammar.
 *
 * Same discipline as the backend's MockLink: the mock is a fake DEVICE behind
 * the same wire format, not a fake client — so the protocol layer, view model
 * and screens run the identical code path with or without hardware (Expo Go,
 * web, jest). Emits the enriched 12-field BLE telemetry line every 250ms and
 * answers commands with OK:/R: exactly like commandQueue.ino.
 */
import type {
  ConnectionListener,
  ConnectionState,
  LineListener,
  PouchTransport,
} from './types';

const FRAME_INTERVAL_MS = 250;
/** A plausible checked-out user: Temples 25 / Ears 40, front and back off. */
const MOCK_USER = { id: 8, name: 'Edna Levi', pressures: [0, 25, 40, 0] };

export class MockTransport implements PouchTransport {
  private state: ConnectionState = 'idle';
  private targets = [0, 0, 0, 0];
  private actuals = [0, 0, 0, 0];
  private sessionStart: number | null = null;
  private lineListeners = new Set<LineListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    this.setState('connecting');
    this.setState('connected');
    if (!this.timer) {
      this.timer = setInterval(() => this.emitFrame(), FRAME_INTERVAL_MS);
    }
  }

  async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setState('disconnected');
  }

  async sendLine(line: string): Promise<void> {
    const [word, rest = ''] = line.split(/:(.*)/s);
    switch (word.toLowerCase()) {
      case 'start':
        this.targets = [...MOCK_USER.pressures];
        this.sessionStart = Date.now();
        this.emit('OK:START');
        break;
      case 'stop':
        this.targets = [0, 0, 0, 0];
        this.sessionStart = null;
        this.emit('OK:STOP');
        break;
      case 'setpressure':
        for (const pair of rest.split(';')) {
          const [ch, val] = pair.split(',').map(Number);
          if (ch >= 0 && ch < 4 && Number.isFinite(val)) {
            this.targets[ch] = val;
            if (this.sessionStart === null && val > 0) this.sessionStart = Date.now();
            this.emit(`OK:SETPRESSURE:${ch},${val}`);
          }
        }
        if (!this.targets.some((t) => t > 0)) this.sessionStart = null;
        break;
      case 'setvibration':
        this.emit('OK:SETVIBRATION');
        break;
      case 'readuser':
        this.emit(
          `R:USER:${MOCK_USER.id},true,${MOCK_USER.pressures.join(',')},${MOCK_USER.name}`,
        );
        break;
      default:
        this.emit(`ERR:UNKNOWN:${line}`);
    }
  }

  onLine(listener: LineListener): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.state);
    return () => this.connectionListeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  // --- internals ---

  private emitFrame(): void {
    // First-order approach toward targets with ±1 flutter, like the bench.
    this.actuals = this.actuals.map((a, i) => {
      const step = Math.sign(this.targets[i] - a) * Math.min(2, Math.abs(this.targets[i] - a));
      const flutter = this.targets[i] > 0 ? Math.floor(Math.random() * 3) - 1 : 0;
      return Math.max(0, a + step + flutter);
    });
    const running = this.targets.some((t) => t > 0);
    const settled = this.actuals.every((a, i) => Math.abs(a - this.targets[i]) <= 3);
    const state = !running ? 'I' : settled ? 'M' : 'P';
    const elapsed = this.sessionStart
      ? Math.floor((Date.now() - this.sessionStart) / 1000)
      : 0;
    this.emit(
      `T:${state},${elapsed},${this.actuals.join(',')},${this.targets.join(',')},80,0`,
    );
  }

  private emit(line: string): void {
    this.lineListeners.forEach((l) => l(line));
  }

  private setState(next: ConnectionState): void {
    this.state = next;
    this.connectionListeners.forEach((l) => l(next));
  }
}
