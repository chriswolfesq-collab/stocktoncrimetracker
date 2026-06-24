const map=L.map("map").setView([37.9577,-121.2908],12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors"}).addTo(map);

const categoryColors={
  SHOOTING:"#ff3131", HOMICIDE:"#8b0000", ROBBERY:"#ff6b35", BURGLARY:"#ffb347",
  PURSUIT:"#b56cff", TRAFFIC:"#4dabf7", FIRE:"#ff7f11", MISSING:"#ffd166", OTHER:"#75e092"
};

let stories=[];
let markers=[];
let selectedId=null;
const $=id=>document.getElementById(id);

function daysAgo(story){
  const d=new Date(story.date);
  return Math.floor((new Date()-d)/86400000);
}

function matchesRange(story){
  const r=$("rangeFilter").value;
  const age=daysAgo(story);
  if(r==="TODAY")return age===0;
  if(r==="WEEK")return age<=7;
  if(r==="MONTH")return age<=31;
  return true;
}

function visibleStories(){
  const cat=$("categoryFilter").value;
  const search=($("searchBox").value+" "+$("quickSearch").value).trim().toLowerCase();
  return stories.filter(s=>{
    if(!matchesRange(s))return false;
    if(cat!=="ALL"&&s.category!==cat)return false;
    const hay=`${s.title} ${s.locationText} ${s.summary} ${s.source}`.toLowerCase();
    if(search&&!hay.includes(search))return false;
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));
}

function markerIcon(story){
  return L.divIcon({
    className:"",
    html:`<div style="width:22px;height:22px;border-radius:50%;background:${categoryColors[story.category]||categoryColors.OTHER};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.55)"></div>`,
    iconSize:[22,22],
    iconAnchor:[11,11]
  });
}

async function loadStories(force=false){
  $("status").textContent="Pulling news sources...";
  try{
    const res=await fetch(`/api/stories${force?"?force=1":""}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    stories=data.stories||[];
    $("status").textContent=`Loaded ${stories.length} news stories. Updated ${new Date(data.updatedAt).toLocaleTimeString()}.`;
    render();
    if(stories[0])selectStory(stories[0].id);
  }catch(e){
    console.error(e);
    $("status").textContent="Unable to load news aggregator. Make sure the Node server is running.";
  }
}

function render(){
  markers.forEach(m=>map.removeLayer(m));
  markers=[];
  const list=visibleStories();

  list.forEach(story=>{
    const m=L.marker([story.lat,story.lng],{icon:markerIcon(story)}).addTo(map);
    m.bindPopup(`
      <div class="popup">
        <h3>${story.title}</h3>
        <p>${story.summary}</p>
        <b>${story.locationText||"Stockton, CA"}</b><br>
        ${new Date(story.date).toLocaleString()}<br>
        <button onclick="selectStory('${story.id}')">Open Story</button>
      </div>
    `);
    markers.push(m);
  });

  renderFeed(list);
  updateStats(list);
}

function renderFeed(list){
  const feed=$("feed");
  feed.innerHTML="";
  list.forEach(story=>{
    const div=document.createElement("div");
    div.className="feedItem"+(story.id===selectedId?" active":"");
    div.innerHTML=`
      <div class="meta">${new Date(story.date).toLocaleDateString()} • ${story.locationText||"Stockton, CA"}</div>
      <div class="title"><span class="category-dot" style="background:${categoryColors[story.category]||categoryColors.OTHER}"></span>${story.title}</div>
      <div class="desc">${story.summary}</div>
      <span class="badge">${story.category}</span>
      <span class="badge">${story.status}</span>
      <span class="badge">${story.source}</span>
      ${story.geocodeQuality==="city"?'<span class="badge">Approx. Map</span>':''}
    `;
    div.onclick=()=>selectStory(story.id);
    feed.appendChild(div);
  });
}

function updateStats(list){
  $("totalStories").textContent=list.length;
  $("violentStories").textContent=list.filter(s=>["SHOOTING","HOMICIDE","ROBBERY"].includes(s.category)).length;
  $("arrestStories").textContent=list.filter(s=>s.arrest).length;
  $("sourceCount").textContent=new Set(list.flatMap(s=>(s.sources||[]).map(x=>x.name))).size;
  $("showingLabel").textContent="Showing: "+$("rangeFilter").selectedOptions[0].textContent;
  $("countLabel").textContent=list.length+" stories visible";
}

window.selectStory=function(id){
  selectedId=id;
  const story=stories.find(s=>s.id===id);
  if(!story)return;
  $("storyTitle").textContent=story.title;
  $("storyMeta").innerHTML=`${new Date(story.date).toLocaleString()}<br>${story.locationText||"Stockton, CA"}<br>${story.source}`;
  $("storyDetails").innerHTML=`
    <div class="card">
      <span class="badge">${story.category}</span>
      <span class="badge">${story.status}</span>
      ${story.arrest?'<span class="badge">Arrest/Court Mentioned</span>':''}
      ${story.geocodeQuality==="city"?'<span class="badge">Mapped to City Center</span>':''}
      <p>${story.summary}</p>
    </div>

    <div class="card">
      <h3>Sources</h3>
      ${(story.sources||[]).map(s=>`<a class="sourceLink" href="${s.url}" target="_blank" rel="noopener">${s.name}<small>${s.url}</small></a>`).join("")}
    </div>

    <div class="card">
      <h3>Timeline</h3>
      <div class="timeline">
        ${(story.timeline||[]).map(t=>`<div><b>${t.label}</b><small>${t.detail}</small></div>`).join("")}
      </div>
    </div>
  `;
  map.setView([story.lat,story.lng], story.geocodeQuality==="street"?15:12);
  renderFeed(visibleStories());
};

function fitMap(){
  const list=visibleStories();
  if(!list.length)return;
  map.fitBounds(L.latLngBounds(list.map(s=>[s.lat,s.lng])).pad(.2));
}

$("rangeFilter").onchange=render;
$("categoryFilter").onchange=render;
$("searchBox").oninput=render;
$("quickSearch").oninput=render;
$("fitBtn").onclick=fitMap;
$("refreshBtn").onclick=()=>loadStories(true);

loadStories();
