const DATASET = "https://data.stocktonca.gov/resource/esc4-8x43.json";

const map = L.map("map").setView([37.9577, -121.2908], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

let allIncidents = [];
let visibleIncidents = [];
let cluster = L.markerClusterGroup({ chunkedLoading: true });
map.addLayer(cluster);
let refreshTimer = null;

const els = {
  datePreset: document.getElementById("datePreset"),
  customDates: document.getElementById("customDates"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  applyCustom: document.getElementById("applyCustom"),
  categoryFilter: document.getElementById("categoryFilter"),
  typeFilter: document.getElementById("typeFilter"),
  districtFilter: document.getElementById("districtFilter"),
  searchBox: document.getElementById("searchBox"),
  reloadBtn: document.getElementById("reloadBtn"),
  fitBtn: document.getElementById("fitBtn"),
  autoRefresh: document.getElementById("autoRefresh"),
  status: document.getElementById("status"),
  totalCalls: document.getElementById("totalCalls"),
  p1Calls: document.getElementById("p1Calls"),
  p2Calls: document.getElementById("p2Calls"),
  p3Calls: document.getElementById("p3Calls"),
  showingLabel: document.getElementById("showingLabel"),
  countLabel: document.getElementById("countLabel")
};

function pad(n){ return String(n).padStart(2, "0"); }
function dateOnly(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function getRange() {
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);

  switch (els.datePreset.value) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "today":
      start.setHours(0,0,0,0);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0,0,0,0);
      end = new Date(start);
      end.setHours(23,59,59,999);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "custom":
      if (!els.fromDate.value || !els.toDate.value) return null;
      start = new Date(`${els.fromDate.value}T00:00:00`);
      end = new Date(`${els.toDate.value}T23:59:59`);
      break;
  }
  return { start, end };
}

function rangeLabel() {
  const selected = els.datePreset.options[els.datePreset.selectedIndex].text;
  if (els.datePreset.value !== "custom") return selected;
  return `${els.fromDate.value || "?"} to ${els.toDate.value || "?"}`;
}

function socrataDate(d) {
  return `${dateOnly(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildUrl() {
  const range = getRange();
  const params = new URLSearchParams();
  params.set("$limit", "5000");
  params.set("$order", "call_entry_date DESC, call_entry_time_formatted DESC");

  if (range) {
    const where = `call_entry_date >= '${socrataDate(range.start)}' AND call_entry_date <= '${socrataDate(range.end)}'`;
    params.set("$where", where);
  }

  return `${DATASET}?${params.toString()}`;
}

function classify(typeRaw) {
  const t = (typeRaw || "").toUpperCase();
  if (/(SHOOT|GUN|WEAPON|ASSAULT|ROBB|BATTERY|STABB|HOMICIDE|FIGHT|245|211)/.test(t)) return "VIOLENT";
  if (/(BURGL|THEFT|STOLEN|AUTO THEFT|VEHICLE THEFT|SHOPLIFT|VANDAL|FRAUD|PROPERTY|459|487|488|594)/.test(t)) return "PROPERTY";
  if (/(TRAFFIC|COLLISION|DUI|ACCIDENT|PARKING|VEHICLE|PURSUIT|RECKLESS)/.test(t)) return "TRAFFIC";
  if (/(AMBULANCE|MEDICAL|WELFARE|MENTAL|5150|OVERDOSE|SICK|INJURY)/.test(t)) return "MEDICAL";
  if (/(SUSP|DISTURB|PROWLER|TRESPASS|LOUD|UNKNOWN|CHECK)/.test(t)) return "SUSPICIOUS";
  return "OTHER";
}

function markerColor(priority) {
  if (priority === "1") return "#ff3131";
  if (priority === "2") return "#ff9f1c";
  if (priority === "3") return "#ffe66d";
  return "#4dabf7";
}

function makeIncident(r) {
  const lat = parseFloat(r.y);
  const lng = parseFloat(r.x);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const type = r.call_type_final_d || r.call_type_final || "Unknown";
  const category = classify(type);
  const date = (r.call_entry_date || "").split(" ")[0];
  const time = r.call_entry_time_formatted || "";

  return {
    raw: r,
    lat,
    lng,
    type,
    category,
    priority: r.priority || "",
    callNo: r.call_no || "",
    reportNo: r.report_no || "",
    date,
    time,
    location: r.first_cross_street || "Unavailable",
    district: r.districtname || "Unknown",
    beat: r.beat || "",
    searchText: `${type} ${r.first_cross_street || ""} ${r.districtname || ""} ${r.beat || ""}`.toLowerCase()
  };
}

function createMarker(i) {
  const color = markerColor(i.priority);
  const marker = L.circleMarker([i.lat, i.lng], {
    radius: 7,
    color: "#fff",
    weight: 1,
    fillColor: color,
    fillOpacity: 0.9
  });

  marker.bindPopup(`
    <div class="popup">
      <h3>${i.type}</h3>
      <div class="popup-row"><b>Category</b>${i.category}</div>
      <div class="popup-row"><b>Priority</b>${i.priority}</div>
      <div class="popup-row"><b>Date</b>${i.date}</div>
      <div class="popup-row"><b>Time</b>${i.time}</div>
      <div class="popup-row"><b>Location</b>${i.location}</div>
      <div class="popup-row"><b>District</b>${i.district}</div>
      <div class="popup-row"><b>Beat</b>${i.beat}</div>
      <div class="popup-row"><b>Call #</b>${i.callNo}</div>
      <div class="popup-row"><b>Report #</b>${i.reportNo}</div>
      <hr>
      <em>Related news matching coming in V4.</em>
    </div>
  `);

  return marker;
}

async function loadData() {
  els.status.textContent = "Loading Stockton data...";
  cluster.clearLayers();

  try {
    const response = await fetch(buildUrl());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    allIncidents = json.map(makeIncident).filter(Boolean);
    buildFilterOptions();
    applyFilters();

    els.status.textContent = `Loaded ${allIncidents.length} calls from the public feed.`;
  } catch (err) {
    console.error(err);
    allIncidents = [];
    applyFilters();
    els.status.textContent = `Load failed: ${err.message}`;
    alert("Unable to load Stockton data. Check the console/network tab.");
  }
}

function buildFilterOptions() {
  const currentType = els.typeFilter.value;
  const currentDistrict = els.districtFilter.value;

  const types = [...new Set(allIncidents.map(i => i.type))].sort();
  const districts = [...new Set(allIncidents.map(i => i.district))].sort();

  els.typeFilter.innerHTML = '<option value="ALL">All Call Types</option>';
  types.forEach(t => {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    els.typeFilter.appendChild(o);
  });
  if (types.includes(currentType)) els.typeFilter.value = currentType;

  els.districtFilter.innerHTML = '<option value="ALL">All Districts</option>';
  districts.forEach(d => {
    const o = document.createElement("option");
    o.value = d;
    o.textContent = d;
    els.districtFilter.appendChild(o);
  });
  if (districts.includes(currentDistrict)) els.districtFilter.value = currentDistrict;
}

function applyFilters() {
  const category = els.categoryFilter.value;
  const type = els.typeFilter.value;
  const district = els.districtFilter.value;
  const search = els.searchBox.value.trim().toLowerCase();

  visibleIncidents = allIncidents.filter(i => {
    if (category !== "ALL" && i.category !== category) return false;
    if (type !== "ALL" && i.type !== type) return false;
    if (district !== "ALL" && i.district !== district) return false;
    if (search && !i.searchText.includes(search)) return false;
    return true;
  });

  cluster.clearLayers();
  visibleIncidents.forEach(i => cluster.addLayer(createMarker(i)));

  updateDashboard();
}

function updateDashboard() {
  const p1 = visibleIncidents.filter(i => i.priority === "1").length;
  const p2 = visibleIncidents.filter(i => i.priority === "2").length;
  const p3 = visibleIncidents.length - p1 - p2;

  els.totalCalls.textContent = visibleIncidents.length;
  els.p1Calls.textContent = p1;
  els.p2Calls.textContent = p2;
  els.p3Calls.textContent = p3;
  els.showingLabel.textContent = `Showing: ${rangeLabel()}`;
  els.countLabel.textContent = `${visibleIncidents.length} incidents visible`;
}

function fitMap() {
  if (visibleIncidents.length === 0) return;
  const bounds = L.latLngBounds(visibleIncidents.map(i => [i.lat, i.lng]));
  map.fitBounds(bounds.pad(0.15));
}

els.datePreset.addEventListener("change", () => {
  els.customDates.classList.toggle("hidden", els.datePreset.value !== "custom");
  if (els.datePreset.value !== "custom") loadData();
});
els.applyCustom.addEventListener("click", loadData);
els.reloadBtn.addEventListener("click", loadData);
els.fitBtn.addEventListener("click", fitMap);
els.categoryFilter.addEventListener("change", applyFilters);
els.typeFilter.addEventListener("change", applyFilters);
els.districtFilter.addEventListener("change", applyFilters);
els.searchBox.addEventListener("input", applyFilters);

els.autoRefresh.addEventListener("change", () => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  if (els.autoRefresh.checked) {
    refreshTimer = setInterval(loadData, 60000);
    els.status.textContent = "Auto-refresh enabled.";
  }
});

const today = new Date();
els.toDate.value = dateOnly(today);
const weekAgo = new Date(today);
weekAgo.setDate(weekAgo.getDate() - 7);
els.fromDate.value = dateOnly(weekAgo);

loadData();
