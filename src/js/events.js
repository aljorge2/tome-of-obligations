// src/js/events.js
const listeners = {};
export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
}
export function emit(event, ...args) {
  (listeners[event] || []).forEach(fn => fn(...args));
}
