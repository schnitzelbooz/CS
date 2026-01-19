
var DEVICE_ID = null; 
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  return null;
}

function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${date.toUTCString()}`;
  const isHttps = location.protocol === 'https:';
  const secure = isHttps ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax${secure}`;
}

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateDeviceId() {
  if (window.__deviceIdCache) return window.__deviceIdCache;
  let id = getCookie('deviceId');
  if (!id) {
    id = generateId();
    setCookie('deviceId', id, 3650); // ~10 years
  }

  window.__deviceIdCache = id;
  return id;
}

async function registerDevice() {
  const deviceId = DEVICE_ID || getOrCreateDeviceId();
  const deviceRef = db.ref('devices/' + deviceId);
  const now = new Date().toISOString();
  const snapshot = await deviceRef.get();
  if (!snapshot.exists()) {
    await deviceRef.set({
      firstSeen: now,
      lastSeen: now,
      userAgent: navigator.userAgent || 'unknown',
      visits: 1,
      status: 'out'
    });
  } else {
    const data = snapshot.val() || {};
    await deviceRef.update({
      lastSeen: now,
      visits: (data.visits || 0) + 1
    });
  }
}
async function loadData() {
  const snapshot = await db.ref("cafeteriaCount").get();
  return snapshot.exists() ? snapshot.val() : 0;
}
async function loadHistory() {
  const snapshot = await db.ref("cafeteriaHistory").get();
  return snapshot.exists() ? snapshot.val() : [];
}
async function addHistory(action, newCount) {
  const timestamp = new Date().toLocaleString();
  const deviceId = DEVICE_ID || getOrCreateDeviceId();
  const entry = { action: action, count: newCount, time: timestamp, deviceId: deviceId, ts: Date.now() };
  await db.ref("cafeteriaHistory").push(entry);
}
async function increase() {
  try {
    const deviceId = DEVICE_ID || getOrCreateDeviceId();
    const deviceRef = db.ref('devices/' + deviceId);
    const lockRes = await deviceRef.child('lock').transaction(function(current){
      if (current) return; // abort if already locked
      return true;
    });
    if (!lockRes.committed) {
      return; // another action in progress
    }
    const devSnap = await deviceRef.get();
    var currentStatus = devSnap.exists() && devSnap.val() && devSnap.val().status ? devSnap.val().status : 'out';
    if (currentStatus === 'in') {
      alert('You are already IN. Use Exit instead.');
      updateButtonsForStatus('in');
      await deviceRef.child('lock').set(null);
      return;
    }
    const ref = db.ref("cafeteriaCount");
    const result = await ref.transaction(function(current) {
      return (typeof current === 'number' ? current : 0) + 1;
    });
    if (result.committed) {
      const newCount = result.snapshot.val() || 0;
      await addHistory("Entered", newCount);
      await deviceRef.update({ status: 'in' });
      updateButtonsForStatus('in');
    }
    await deviceRef.child('lock').set(null);
  } catch (e) {
    console.error('Increase failed:', e);
    alert('Failed to increase count. Check console for details.');
  }
}
async function decrease() {
  try {
    const deviceId = DEVICE_ID || getOrCreateDeviceId();
    const deviceRef = db.ref('devices/' + deviceId);
    // acquire per-device lock atomically
    const lockRes = await deviceRef.child('lock').transaction(function(current){
      if (current) return; // abort if already locked
      return true;
    });
    if (!lockRes.committed) {
      return; // another action in progress
    }
    const devSnap = await deviceRef.get();
    var currentStatus = devSnap.exists() && devSnap.val() && devSnap.val().status ? devSnap.val().status : 'out';
    if (currentStatus !== 'in') {
      alert('You are not currently IN. Use Enter first.');
      updateButtonsForStatus('out');
      await deviceRef.child('lock').set(null);
      return;
    }
    const ref = db.ref("cafeteriaCount");
    const result = await ref.transaction(function(current) {
      const value = (typeof current === 'number' ? current : 0);
      return value > 0 ? value - 1 : 0;
    });
    if (result.committed) {
      const newCount = result.snapshot.val() || 0;
      await addHistory("Exited", newCount);
      await deviceRef.update({ status: 'out' });
      updateButtonsForStatus('out');
    }
    await deviceRef.child('lock').set(null);
  } catch (e) {
    console.error('Decrease failed:', e);
    alert('Failed to decrease count. Check console for details.');
  }
}
async function showData() {
  let count = await loadData();
  document.getElementById("output").innerText = count;
  let history = await loadHistory();
  renderHistory(history);
}
// ...existing code...

if (typeof window !== 'undefined') {
  window.addEventListener('load', function() {
    try { DEVICE_ID = getOrCreateDeviceId(); } catch(e) { DEVICE_ID = null; }
    startClock();
    updateButtonsForStatus('out');
    
    checkDailyResetOnLoad().catch(function() {});
    
    registerDevice().catch(function() {});

    try {
      var outputEl = document.getElementById("output");
      if (outputEl) outputEl.innerText = "--";

      showData().catch(function() {});

      db.ref("cafeteriaCount").on('value', function(snapshot) {
        var count = snapshot.exists() ? snapshot.val() : 0;
        var outputEl = document.getElementById("output");
        if (outputEl) outputEl.innerText = count;
      });
      db.ref("cafeteriaHistory").on('value', function(snapshot) {
        var history = snapshot.exists() ? snapshot.val() : [];
        renderHistory(history);
      });
      try {
        var devIdForListen = DEVICE_ID || getOrCreateDeviceId();
        db.ref('devices/' + devIdForListen).on('value', function(s) {
          var st = s.exists() && s.val() && s.val().status ? s.val().status : 'out';
          updateButtonsForStatus(st);
        });
      } catch(e) {}
    } catch (e) {
    }
  });
}

function renderHistory(history) {
  var body = document.getElementById("historyBody");
  if (!body) return;
  body.innerHTML = "";
  var items = Array.isArray(history) ? history : (history && typeof history === 'object' ? Object.values(history) : []);
  items.sort(function(a, b) {
    var ta = a && typeof a.ts === 'number' ? a.ts : 0;
    var tb = b && typeof b.ts === 'number' ? b.ts : 0;
    return tb - ta;
  });
  
  items.forEach(function(entry) {
    if (!entry) return;
    var tr = document.createElement('tr');
    var idTd = document.createElement('td');
    idTd.textContent = formatId(entry.deviceId);
    var typeTd = document.createElement('td');
    typeTd.textContent = (entry.action || '').toLowerCase();
    var timeTd = document.createElement('td');
    timeTd.textContent = entry.time || '';
    tr.appendChild(idTd); tr.appendChild(typeTd); tr.appendChild(timeTd);
    body.appendChild(tr);
  });
}

function formatId(id) {
  if (!id || typeof id !== 'string') return '-';
  if (id.length <= 10) return id;
  return '…' + id.slice(-8);
}

function setButtonsEnabled(enabled) {
  var btn = document.getElementById('toggleBtn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '' : '0.6';
  btn.style.cursor = enabled ? '' : 'not-allowed';
}

var currentDeviceStatus = 'out';
var actionInProgress = false;
function updateButtonsForStatus(status) {
  currentDeviceStatus = status || 'out';
  var btn = document.getElementById('toggleBtn');
  if (!btn) return;
  if (currentDeviceStatus === 'in') {
    btn.textContent = 'Exit';
    btn.className = 'exit-state';
    var s = document.getElementById('statusText');
    if (s) s.textContent = 'You are currently inside the cafeteria';
  } else {
    btn.textContent = 'Enter';
    btn.className = 'enter-state';
    var s2 = document.getElementById('statusText');
    if (s2) s2.textContent = 'You are currently outside the cafeteria';
  }
  setButtonsEnabled(true);
}

async function toggle() {
  // Route to increase/decrease based on current status
  if (actionInProgress) return;
  actionInProgress = true;
  setButtonsEnabled(false);
  try {
    if (currentDeviceStatus === 'in') {
      await decrease();
    } else {
      await increase();
    }
  } finally {
    actionInProgress = false;
    setButtonsEnabled(true);
  }
}

// Live clock
function startClock() {
  var el = document.getElementById('clock');
  if (!el) return;
  function tick() {
    var now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour12: true });
    // Check for midnight reset
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) {
      checkAndResetDaily();
    }
  }
  tick();
  setInterval(tick, 1000);
}

// Daily reset at midnight
async function checkAndResetDaily() {
  try {
    var today = new Date().toDateString();
    var lastResetRef = db.ref('lastDailyReset');
    var lastResetSnap = await lastResetRef.get();
    var lastResetDate = lastResetSnap.exists() ? lastResetSnap.val() : null;
    
    if (lastResetDate !== today) {
      // Reset count to 0
      await db.ref('cafeteriaCount').set(0);
      // Update last reset date
      await lastResetRef.set(today);
      console.log('Daily reset completed at midnight');
    }
  } catch (e) {
    console.error('Daily reset failed:', e);
  }
}

// Check on page load if reset is needed
async function checkDailyResetOnLoad() {
  try {
    var now = new Date();
    var today = now.toDateString();
    var lastResetRef = db.ref('lastDailyReset');
    var lastResetSnap = await lastResetRef.get();
    var lastResetDate = lastResetSnap.exists() ? lastResetSnap.val() : null;
    
    // If it's past midnight and hasn't been reset today, reset it
    if (lastResetDate !== today && now.getHours() >= 0) {
      await db.ref('cafeteriaCount').set(0);
      await lastResetRef.set(today);
      console.log('Daily reset completed on page load');
    }
  } catch (e) {
    console.error('Daily reset check failed:', e);
  }
}