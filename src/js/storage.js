// Falls back to in-memory when localStorage is blocked (file:// protocol)
const _memStore = {};
let _useLocalStorage = true;
try {
  localStorage.setItem('__test__', '1');
  localStorage.removeItem('__test__');
} catch (e) { _useLocalStorage = false; }

export const safeStorage = {
  getItem(key) {
    if (_useLocalStorage) { try { return localStorage.getItem(key); } catch (e) {} }
    return _memStore[key] || null;
  },
  setItem(key, val) {
    if (_useLocalStorage) { try { localStorage.setItem(key, val); } catch (e) {} }
    _memStore[key] = val;
  },
  removeItem(key) {
    if (_useLocalStorage) { try { localStorage.removeItem(key); } catch (e) {} }
    delete _memStore[key];
  }
};

export function isLocalStorageAvailable() {
  return _useLocalStorage;
}

// Show a subtle warning if running without persistence
export function showPersistenceWarning() {
  if (_useLocalStorage) return;
  setTimeout(() => {
    const warn = document.createElement('div');
    warn.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:200;font-family:Crimson Text,serif;font-size:11px;color:#e0a040;background:rgba(10,3,8,0.9);border:1px solid rgba(200,140,40,0.3);padding:5px 14px;border-radius:3px;font-style:italic;opacity:0.8;';
    warn.textContent = 'running without persistence — use Transcribe to save your data';
    document.body.appendChild(warn);
    setTimeout(() => { warn.style.transition = 'opacity 1s'; warn.style.opacity = '0'; setTimeout(() => warn.remove(), 1000); }, 8000);
  }, 1000);
}
