// --- Load Data ---
function loadData() {
  return parseInt(localStorage.getItem("cafeteriaCount")) || 0;
}

// --- Save Data ---
function saveData(count) {
  localStorage.setItem("cafeteriaCount", count);
}

// --- Load History ---
function loadHistory() {
  let history = localStorage.getItem("cafeteriaHistory");
  return history ? JSON.parse(history) : [];
}

// --- Save History ---
function saveHistory(history) {
  localStorage.setItem("cafeteriaHistory", JSON.stringify(history));
}

// --- Add to History ---
function addHistory(action, newCount) {
  let history = loadHistory();
  let timestamp = new Date().toLocaleString(); // current time
  history.push({ action: action, count: newCount, time: timestamp });
  saveHistory(history);
}

// --- Increase Count ---
function increase() {
  let count = loadData();
  count++;
  saveData(count);
  addHistory("Entered", count);
  showData();
}

// --- Decrease Count ---
function decrease() {
  let count = loadData();
  if (count > 0) count--;
  saveData(count);
  addHistory("Exited", count);
  showData();
}

// --- Reset Count & History ---
function reset() {
  saveData(0);
  saveHistory([]);
  showData();
}

// --- Show Current Count & History ---
function showData() {
  // Show current congestion
  let count = loadData();
  document.getElementById("output").innerText = "Current count: " + count;

  // Show history log
  let history = loadHistory();
  let historyList = document.getElementById("history");
  historyList.innerHTML = "";
  history.forEach(entry => {
    let li = document.createElement("li");
    li.innerText = `${entry.time}: ${entry.action} → ${entry.count} people`;
    historyList.appendChild(li);
  });
}
