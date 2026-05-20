// src/js/gcal.js — Google Calendar integration
// Client-side OAuth using Google Identity Services (GIS)
// Fetches events and displays them in the calendar + creates wards

import { uid } from './utils.js';
import { state, saveState } from './state.js';
import { renderWards } from './wards.js';
import { emit } from './events.js';

const GCAL_KEY = 'tome_gcal_v1';
const TOKEN_KEY = 'tome_gcal_token';
const CLIENT_ID_KEY = 'tome_gcal_client_id';

// Configurable — user sets this in settings
let _clientId = null;
let _tokenClient = null;
let _accessToken = null;
let _events = [];
let _calendarList = [];

function loadConfig(){
  try {
    const raw = localStorage.getItem(GCAL_KEY);
    if(raw) return JSON.parse(raw);
  } catch(e){}
  return { enabled: false, clientId: '', calendarIds: [], lastSync: null };
}

function saveConfig(cfg){
  try { localStorage.setItem(GCAL_KEY, JSON.stringify(cfg)); } catch(e){}
}

function loadToken(){
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if(raw){
      const t = JSON.parse(raw);
      // Check expiry
      if(t.expiresAt && Date.now() < t.expiresAt) return t.accessToken;
    }
  } catch(e){}
  return null;
}

function saveToken(token, expiresIn){
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      accessToken: token,
      expiresAt: Date.now() + (expiresIn * 1000) - 60000, // 1 min buffer
    }));
  } catch(e){}
}

async function fetchWithAuth(url){
  if(!_accessToken) return null;
  try {
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${_accessToken}` }
    });
    if(resp.status === 401){
      _accessToken = null;
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return await resp.json();
  } catch(e){
    console.warn('GCal fetch failed:', e);
    return null;
  }
}

export async function fetchEvents(daysAhead = 14){
  const now = new Date();
  const timeMin = now.toISOString();
  const future = new Date(now.getTime() + daysAhead * 86400000);
  const timeMax = future.toISOString();
  
  const config = loadConfig();
  const calendars = config.calendarIds?.length ? config.calendarIds : ['primary'];
  
  const allEvents = [];
  for(const calId of calendars){
    const encoded = encodeURIComponent(calId);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encoded}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`;
    const data = await fetchWithAuth(url);
    if(data?.items){
      allEvents.push(...data.items.map(ev => ({
        id: ev.id,
        title: ev.summary || '(no title)',
        start: ev.start?.dateTime || ev.start?.date,
        end: ev.end?.dateTime || ev.end?.date,
        allDay: !ev.start?.dateTime,
        location: ev.location || '',
        calendarId: calId,
        color: ev.colorId || null,
      })));
    }
  }
  
  _events = allEvents.sort((a,b) => new Date(a.start) - new Date(b.start));
  config.lastSync = new Date().toISOString();
  saveConfig(config);
  
  emit('gcalSynced', _events);
  return _events;
}

export function getEvents(){ return _events; }

export function getEventsForDate(dateStr){
  return _events.filter(ev => {
    const evDate = ev.start.slice(0, 10);
    return evDate === dateStr;
  });
}

/**
 * Create wards from today's calendar events.
 * Only creates wards that don't already exist (by matching gcalId).
 */
export function syncEventsToWards(){
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const todayEvents = _events.filter(ev => {
    const d = ev.start.slice(0, 10);
    return d === todayStr || d === tomorrowStr;
  });
  
  let added = 0;
  todayEvents.forEach(ev => {
    // Skip all-day events
    if(ev.allDay) return;
    // Check if ward already exists for this event
    const exists = (state.wards || []).some(w => w.gcalId === ev.id);
    if(exists) return;
    
    state.wards.push({
      id: uid(),
      text: ev.title + (ev.location ? ` @ ${ev.location}` : ''),
      time: new Date(ev.start).getTime(),
      endTime: ev.end ? new Date(ev.end).getTime() : null,
      done: false,
      isMeeting: true,
      gcalId: ev.id,
      page: 'work',
    });
    added++;
  });
  
  if(added > 0){
    saveState();
    renderWards();
  }
  return added;
}

function initGIS(){
  const config = loadConfig();
  _clientId = config.clientId;
  if(!_clientId) return false;
  
  // Check for existing token
  _accessToken = loadToken();
  if(_accessToken) return true;
  
  return false;
}

export function isConnected(){
  return !!_accessToken;
}

export function startAuth(){
  const config = loadConfig();
  if(!config.clientId){
    showSettings();
    return;
  }
  
  // Load GIS library dynamically if not loaded
  if(!window.google?.accounts?.oauth2){
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => doAuth(config.clientId);
    document.head.appendChild(script);
  } else {
    doAuth(config.clientId);
  }
}

function doAuth(clientId){
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    callback: (response) => {
      if(response.access_token){
        _accessToken = response.access_token;
        saveToken(response.access_token, response.expires_in || 3600);
        // Fetch events immediately
        fetchEvents().then(() => {
          syncEventsToWards();
          emit('gcalConnected');
        });
      }
    },
  });
  _tokenClient.requestAccessToken();
}

export function disconnect(){
  _accessToken = null;
  _events = [];
  localStorage.removeItem(TOKEN_KEY);
  emit('gcalDisconnected');
}

export function showSettings(){
  const existing = document.getElementById('gcal-settings-overlay');
  if(existing) existing.remove();
  
  const config = loadConfig();
  
  const overlay = document.createElement('div');
  overlay.id = 'gcal-settings-overlay';
  overlay.className = 'gcal-settings-overlay';
  overlay.innerHTML = `
    <div class="gcal-settings-panel">
      <div class="gcal-settings-title"><i class="ti ti-calendar"></i> Google Calendar</div>
      <div class="gcal-settings-desc">Connect your Google Calendar to see events in the Grimoire Calendar and auto-create wards for meetings.</div>
      
      <div class="gcal-settings-section">
        <label class="gcal-label">Google OAuth Client ID</label>
        <input class="gcal-input" id="gcal-client-id" value="${config.clientId || ''}" placeholder="xxxx.apps.googleusercontent.com" />
        <div class="gcal-help">
          <details>
            <summary>How to get a Client ID</summary>
            <ol>
              <li>Go to <strong>console.cloud.google.com</strong></li>
              <li>Create a new project (or use existing)</li>
              <li>Enable the <strong>Google Calendar API</strong></li>
              <li>Go to <strong>Credentials → Create Credentials → OAuth client ID</strong></li>
              <li>Choose <strong>Web application</strong></li>
              <li>Add <strong>http://localhost:5173</strong> to Authorized JavaScript origins</li>
              <li>Copy the Client ID and paste it here</li>
            </ol>
          </details>
        </div>
      </div>
      
      <div class="gcal-settings-status" id="gcal-status">
        ${_accessToken ? '<span style="color:#3da855">✓ Connected</span> · <span class="gcal-disconnect" id="gcal-disconnect">disconnect</span>' : '<span style="color:#6a4a55">Not connected</span>'}
      </div>
      
      <div class="gcal-settings-actions">
        <button class="gcal-btn" id="gcal-save-btn">Save & Connect</button>
        <button class="gcal-btn gcal-btn-secondary" id="gcal-close-btn">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  
  overlay.querySelector('#gcal-save-btn').addEventListener('click', () => {
    const clientId = document.getElementById('gcal-client-id').value.trim();
    config.clientId = clientId;
    config.enabled = !!clientId;
    saveConfig(config);
    if(clientId){
      overlay.remove();
      startAuth();
    }
  });
  
  overlay.querySelector('#gcal-close-btn').addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  });
  
  overlay.querySelector('#gcal-disconnect')?.addEventListener('click', () => {
    disconnect();
    overlay.remove();
  });
  
  overlay.addEventListener('click', (e) => {
    if(e.target === overlay){
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
    }
  });
}

export async function initGCal(){
  const hasAuth = initGIS();
  if(hasAuth){
    // Auto-fetch events on load
    await fetchEvents();
    syncEventsToWards();
  }
}
