export type AdminConfirmKind = 'reset' | 'promote';

export interface AdminActionsProps {
  disabled: boolean;
  onResetDefaults: () => void;
  onSetCurrentDefault: () => void;
  onOpenVibration: () => void;
  onOpenDefaults: () => void;
}
