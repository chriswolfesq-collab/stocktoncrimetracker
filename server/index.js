const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");
const cheerio = require("cheerio");

const app = express();
const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "StocktonIncidentMap/1.0 (+local public safety news aggregator)"
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let cache = { timestamp: 0, stories: [] };

const STOCKTON_CENTER = { lat: 37.9577, lng: -121.2908 };

const googleNewsQueries = [
  `Stockton California shooting OR homicide OR robbery OR arrest`,
  `Stockton California police OR sheriff public safety`,
  `Stockton California crash OR pursuit OR fire`,
  `site:stocktonia.org Stockton public safety`,
  `site:kcra.com Stockton shooting OR homicide OR arrest`,
  `site:abc10.com Stockton shooting OR homicide OR arrest`,
  `site:fox40.com Stockton shooting OR homicide OR arrest`,
  `site:recordnet.com Stockton crime OR police`
];

const rssFeeds = [
  { source: "KCRA", url: "https://www.kcra.com/topstories-rss" },
  { source: "Stocktonia Public Safety", url: "https://stocktonia.org/news/category/public-safety/feed/" },
  { source: "Stocktonia", url: "https://stocktonia.org/feed/" }
];

const keywords = [
  "stockton", "san joaquin", "lodi", "manteca", "tracy", "french camp",
  "shooting", "homicide", "killed", "deadly", "murder", "robbery", "burglary",
  "arrest", "police", "sheriff", "deputy", "officer", "pursuit", "crash",
  "hit-and-run", "fire", "missing", "wanted", "stabbing", "assault", "gun"
];

function googleNewsUrl(query) {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
}

function cleanText(s = "") {
  return String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function classify(text) {
  const t = text.toLowerCase();
  if (/homicide|murder|killed|deadly shooting|fatal shooting/.test(t)) return "HOMICIDE";
  if (/shooting|shots fired|gunfire|gun/.test(t)) return "SHOOTING";
  if (/robbery|carjack/.test(t)) return "ROBBERY";
  if (/burglary|break-in|break in/.test(t)) return "BURGLARY";
  if (/pursuit|chase/.test(t)) return "PURSUIT";
  if (/crash|collision|hit-and-run|hit and run|fatal crash|i-5|i-80|highway|traffic/.test(t)) return "TRAFFIC";
  if (/fire|arson|smoke|burn/.test(t)) return "FIRE";
  if (/missing|wanted|silver alert|amber alert/.test(t)) return "MISSING";
  return "OTHER";
}

function isRelevant(item) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""}`.toLowerCase();
  const hasPlace = /stockton|san joaquin|lodi|manteca|tracy|french camp/.test(text);
  const hasPublicSafety = /shooting|homicide|murder|killed|deadly|robbery|burglary|arrest|police|sheriff|deputy|officer|pursuit|crash|hit-and-run|fire|missing|wanted|stabbing|assault|gun|sentenced/.test(text);
  return hasPlace && hasPublicSafety;
}

function sourceFromLink(link = "", fallback = "News") {
  const host = (() => {
    try { return new URL(link).hostname.replace("www.", ""); } catch { return ""; }
  })();
  if (host.includes("kcra")) return "KCRA";
  if (host.includes("abc10")) return "ABC10";
  if (host.includes("fox40")) return "FOX40";
  if (host.includes("stocktonia")) return "Stocktonia";
  if (host.includes("recordnet")) return "The Record";
  if (host.includes("cbsnews")) return "CBS13";
  if (host.includes("news.google")) return fallback;
  return fallback || host || "News";
}

function normalizeItem(item, forcedSource) {
  const title = cleanText(item.title || "Untitled");
  const summary = cleanText(item.contentSnippet || item.summary || item.content || "");
  const link = item.link || item.guid || "";
  const source = forcedSource || sourceFromLink(link, item.creator || item.author || "News");
  const dateRaw = item.isoDate || item.pubDate || new Date().toISOString();
  const date = new Date(dateRaw);
  const text = `${title} ${summary}`;
  const category = classify(text);

  return {
    id: `${title}-${link}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 140),
    title,
    summary: summary || "Open the source for details.",
    category,
    date: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    locationText: extractLocationText(text),
    lat: STOCKTON_CENTER.lat,
    lng: STOCKTON_CENTER.lng,
    needsGeocode: true,
    status: /arrest|sentenced|charged|convicted/.test(text.toLowerCase()) ? "Arrest/Court Update" : "Reported",
    arrest: /arrest|sentenced|charged|convicted/.test(text.toLowerCase()),
    source,
    sources: [{ name: source, url: link }],
    timeline: [
      { label: "Published", detail: isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString() },
      { label: "Source", detail: source },
      { label: "Mapped", detail: "Approximate location extracted from article title/summary when possible." }
    ]
  };
}

function extractLocationText(text) {
  const patterns = [
    /near ([A-Z][A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way|Highway|I-\d+))/,
    /on ([A-Z][A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way|Highway|I-\d+))/,
    /at ([A-Z][A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way|Highway|I-\d+))/,
    /(Hammer Lane|March Lane|Pacific Avenue|Charter Way|Wilson Way|El Dorado Street|Airport Way|West Lane|Pershing Avenue|Waterloo Road|Benjamin Holt Drive|I-5|Highway 99|I-80)/
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] || m[0];
  }
  return "Stockton, CA";
}

async function geocode(story) {
  if (!story.locationText || story.locationText === "Stockton, CA") {
    story.lat = STOCKTON_CENTER.lat;
    story.lng = STOCKTON_CENTER.lng;
    story.geocodeQuality = "city";
    return story;
  }

  try {
    const q = `${story.locationText}, Stockton, CA`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "StocktonIncidentMap/1.0" } });
    const json = await res.json();
    if (json && json[0]) {
      story.lat = parseFloat(json[0].lat);
      story.lng = parseFloat(json[0].lon);
      story.geocodeQuality = "street";
    } else {
      story.geocodeQuality = "city";
    }
  } catch {
    story.geocodeQuality = "city";
  }

  return story;
}

function dedupe(stories) {
  const seen = new Map();

  for (const story of stories) {
    const key = story.title.toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\b(stockton|california|ca|police|sheriff)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    if (!seen.has(key)) {
      seen.set(key, story);
    } else {
      const existing = seen.get(key);
      const urls = new Set(existing.sources.map(s => s.url));
      for (const s of story.sources) {
        if (!urls.has(s.url)) existing.sources.push(s);
      }
      if (story.summary.length > existing.summary.length) existing.summary = story.summary;
      if (story.source && !existing.source.includes(story.source)) {
        existing.source = `${existing.source}, ${story.source}`;
      }
    }
  }

  return [...seen.values()];
}

async function fetchRssFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || [])
      .filter(isRelevant)
      .map(item => normalizeItem(item, feed.source));
  } catch (err) {
    console.warn("RSS failed", feed.url, err.message);
    return [];
  }
}

async function fetchGoogleNews() {
  const all = [];
  for (const q of googleNewsQueries) {
    try {
      const parsed = await parser.parseURL(googleNewsUrl(q));
      for (const item of parsed.items || []) {
        if (isRelevant(item)) all.push(normalizeItem(item));
      }
    } catch (err) {
      console.warn("Google News query failed", q, err.message);
    }
  }
  return all;
}

async function scrapeStocktoniaPublicSafety() {
  try {
    const res = await fetch("https://stocktonia.org/news/category/public-safety/", {
      headers: { "User-Agent": "StocktonIncidentMap/1.0" }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const items = [];

    $("h2 a").each((_, a) => {
      const title = cleanText($(a).text());
      const link = $(a).attr("href");
      if (!title || !link) return;
      const parentText = cleanText($(a).closest("article, .post, body").text()).slice(0, 400);
      const fake = {
        title,
        contentSnippet: parentText,
        link,
        pubDate: new Date().toISOString()
      };
      if (isRelevant(fake)) items.push(normalizeItem(fake, "Stocktonia"));
    });

    return items;
  } catch (err) {
    console.warn("Stocktonia scrape failed", err.message);
    return [];
  }
}

async function buildStories(force = false) {
  const now = Date.now();
  if (!force && cache.stories.length && now - cache.timestamp < 15 * 60 * 1000) {
    return cache.stories;
  }

  const batches = await Promise.all([
    fetchGoogleNews(),
    ...rssFeeds.map(fetchRssFeed),
    scrapeStocktoniaPublicSafety()
  ]);

  let stories = dedupe(batches.flat())
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 80);

  // Geocode slowly enough for a small local app. Fallback is city center.
  const geocoded = [];
  for (const story of stories.slice(0, 40)) {
    geocoded.push(await geocode(story));
    await new Promise(r => setTimeout(r, 250));
  }
  stories = geocoded.concat(stories.slice(40));

  cache = { timestamp: now, stories };
  return stories;
}

app.get("/api/stories", async (req, res) => {
  try {
    const stories = await buildStories(req.query.force === "1");
    res.json({ updatedAt: new Date(cache.timestamp).toISOString(), count: stories.length, stories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Stockton news aggregator running at http://localhost:${PORT}`);
});
