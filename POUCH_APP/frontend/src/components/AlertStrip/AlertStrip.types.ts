import type { Alert } from '@/api/types';

export interface AlertStripProps {
  alerts: Alert[];
  onAck: (eventId: number) => void;
}
