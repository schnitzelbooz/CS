
function loadData() {
  return parseInt(localStorage.getItem("cafeteriaCount")) || 0;
}
function saveData(count) {
  localStorage.setItem("cafeteriaCount", count);
}
function loadHistory() {
  let history = localStorage.getItem("cafeteriaHistory");
  return history ? JSON.parse(history) : [];
}
function saveHistory(history) {
  localStorage.setItem("cafeteriaHistory", JSON.stringify(history));
}
function addHistory(action, newCount) {
  let history = loadHistory();
  let timestamp = new Date().toLocaleString(); // current time
  history.push({ action: action, count: newCount, time: timestamp });
  saveHistory(history);
}
function increase() {
  let count = loadData();
  count++;
  saveData(count);
  addHistory("Entered", count);
  showData();
}
function decrease() {
  let count = loadData();
  if (count > 0) count--;
  saveData(count);
  addHistory("Exited", count);
  showData();
}
function reset() {
  saveData(0);
  saveHistory([]);
  showData();
}
function showData() {
  let count = loadData();
  document.getElementById("output").innerText = "Current count: " + count;
  let history = loadHistory();
  let historyList = document.getElementById("history");
  historyList.innerHTML = "";
  history.forEach(entry => {
    let li = document.createElement("li");
    li.innerText = `${entry.time}: ${entry.action} → ${entry.count} people`;
    historyList.appendChild(li);
  });
}
