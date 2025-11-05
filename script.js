
// ...existing code...
// Cookie helpers and device registration
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${date.toUTCString()}`;
  document.cookie = `${name}=${value}; ${expires}; path=/; SameSite=Lax`;
}

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateDeviceId() {
  let id = getCookie('deviceId');
  if (!id) {
    id = generateId();
    setCookie('deviceId', id, 3650); // ~10 years
  }
  return id;
}

async function registerDevice() {
  const deviceId = getOrCreateDeviceId();
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
function saveData(count) {
  return db.ref("cafeteriaCount").set(count);
}
async function loadHistory() {
  const snapshot = await db.ref("cafeteriaHistory").get();
  return snapshot.exists() ? snapshot.val() : [];
}
function saveHistory(history) {
  return db.ref("cafeteriaHistory").set(history);
}
async function addHistory(action, newCount) {
  const timestamp = new Date().toLocaleString();
  const deviceId = getOrCreateDeviceId();
  const entry = { action: action, count: newCount, time: timestamp, deviceId: deviceId, ts: Date.now() };
  // append instead of overwriting entire array to avoid races
  await db.ref("cafeteriaHistory").push(entry);
}
async function increase() {
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceRef = db.ref('devices/' + deviceId);
    const devSnap = await deviceRef.get();
    var currentStatus = devSnap.exists() && devSnap.val() && devSnap.val().status ? devSnap.val().status : 'out';
    if (currentStatus === 'in') {
      alert('You are already IN. Use Exit instead.');
      updateButtonsForStatus('in');
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
  } catch (e) {
    console.error('Increase failed:', e);
    alert('Failed to increase count. Check console for details.');
  }
}
async function decrease() {
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceRef = db.ref('devices/' + deviceId);
    const devSnap = await deviceRef.get();
    var currentStatus = devSnap.exists() && devSnap.val() && devSnap.val().status ? devSnap.val().status : 'out';
    if (currentStatus !== 'in') {
      alert('You are not currently IN. Use Enter first.');
      updateButtonsForStatus('out');
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
  } catch (e) {
    console.error('Decrease failed:', e);
    alert('Failed to decrease count. Check console for details.');
  }
}
async function showData() {
  let count = await loadData();
  document.getElementById("output").innerText = "Current count: " + count;
  let history = await loadHistory();
  renderHistory(history);
}
// ...existing code...

// Register device on page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', function() {
    // Best-effort; errors will surface in console but won't block UI
    registerDevice().catch(function() {});

    // Realtime listeners to reflect updates immediately
    try {
      // Show placeholders while initial async fetch runs
      var outputEl = document.getElementById("output");
      if (outputEl) outputEl.innerText = "Loading current count...";
      var historyListEl = document.getElementById("history");
      if (historyListEl) historyListEl.innerHTML = "<li>Loading history...</li>";

      // Initial async render (shows current values before any button press)
      showData().catch(function() {});

      db.ref("cafeteriaCount").on('value', function(snapshot) {
        var count = snapshot.exists() ? snapshot.val() : 0;
        var outputEl = document.getElementById("output");
        if (outputEl) outputEl.innerText = "Current count: " + count;
      });
      db.ref("cafeteriaHistory").on('value', function(snapshot) {
        var history = snapshot.exists() ? snapshot.val() : [];
        renderHistory(history);
      });
      // Device status listener to keep the single toggle button in sync
      try {
        var devIdForListen = getOrCreateDeviceId();
        db.ref('devices/' + devIdForListen).on('value', function(s) {
          var st = s.exists() && s.val() && s.val().status ? s.val().status : 'out';
          updateButtonsForStatus(st);
        });
      } catch(e) {}
    } catch (e) {
      // no-op
    }
  });
}

function renderHistory(history) {
  var historyList = document.getElementById("history");
  if (!historyList) return;
  historyList.innerHTML = "";
  var items = Array.isArray(history) ? history : (history && typeof history === 'object' ? Object.values(history) : []);
  // sort newest first using numeric ts; fallback keeps original order
  items.sort(function(a, b) {
    var ta = a && typeof a.ts === 'number' ? a.ts : 0;
    var tb = b && typeof b.ts === 'number' ? b.ts : 0;
    return tb - ta;
  });
  items.forEach(function(entry) {
    if (!entry) return;
    var li = document.createElement("li");
    li.innerText = `${entry.time}: ${entry.action} → ${entry.count} people`;
    historyList.appendChild(li);
  });
}

function setButtonsEnabled(enabled) {
  var btn = document.getElementById('toggleBtn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '' : '0.6';
  btn.style.cursor = enabled ? '' : 'not-allowed';
}

var currentDeviceStatus = 'out';
function updateButtonsForStatus(status) {
  currentDeviceStatus = status || 'out';
  var btn = document.getElementById('toggleBtn');
  if (!btn) return;
  if (currentDeviceStatus === 'in') {
    btn.textContent = 'Exit';
    btn.className = 'exit-state';
  } else {
    btn.textContent = 'Enter';
    btn.className = 'enter-state';
  }
  setButtonsEnabled(true);
}

async function toggle() {
  // Route to increase/decrease based on current status
  if (currentDeviceStatus === 'in') {
    await decrease();
  } else {
    await increase();
  }
}



