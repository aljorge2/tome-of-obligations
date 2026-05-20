// HTML escape
export function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Unique ID generator
let idCounter = 0;
export function uid() { return ++idCounter; }
export function setIdCounter(val) { idCounter = val; }
export function getIdCounter() { return idCounter; }

// Format duration from milliseconds
export function formatDuration(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return mins + 'm';
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
}

// Format countdown from milliseconds
export function formatCountdown(ms) {
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

// Format ISO datetime to readable string
export function formatDateTime(iso) {
  const d = new Date(iso);
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  return d.toLocaleDateString('en-US', opts);
}
