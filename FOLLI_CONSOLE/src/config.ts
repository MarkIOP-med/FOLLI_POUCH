// Central app configuration constants.

// Admin password that gates the EXIT / control-panel screen.
// NOTE: This is intentionally a simple hard-coded gate for a kiosk device.
// It is NOT real security — anyone with the source can read it. It exists only
// to stop an ordinary end-user from casually leaving the locked console.
export const ADMIN_PASSWORD = 'admin123';
