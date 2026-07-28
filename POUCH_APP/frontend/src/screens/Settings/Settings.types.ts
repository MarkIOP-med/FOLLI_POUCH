export interface NewDeviceDraft {
  id: string;
  label: string;
  transport: 'serial' | 'mock';
  port: string;
}
