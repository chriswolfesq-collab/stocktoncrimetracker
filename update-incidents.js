import fs from "fs";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "209IncidentMap/1.0"
  }
});

const OUTPUT_FILE = "incidents.json";

const STOCKTON_CENTER = {
  lat: 37.9577,
  lng: -121.2908
};

const KNOWN_LOCATIONS = [
  ["Hammer Ln", 38.0209, -121.2968],
  ["Hammer Lane", 38.0209, -121.2968],
  ["March Ln", 37.9871, -121.3136],
  ["March Lane", 37.9871, -121.3136],
  ["Pacific Ave", 37.9871, -121.3136],
  ["Pacific Avenue", 37.9871, -121.3136],
  ["West Ln", 38.0208, -121.2956],
  ["West Lane", 38.0208, -121.2956],
  ["Wilson Way", 37.9684, -121.2719],
  ["Airport Way", 37.9432, -121.2603],
  ["El Dorado St", 37.9517, -121.2895],
  ["El Dorado Street", 37.9517, -121.2895],
  ["Charter Way", 37.9359, -121.2954],
  ["Pershing Ave", 37.9734, -121.3152],
  ["Pershing Avenue", 37.9734, -121.3152],
  ["Waterloo Rd", 37.9927, -121.2663],
  ["Waterloo Road", 37.9927, -121.2663],
  ["Benjamin Holt Dr", 38.0062, -121.3385],
  ["Benjamin Holt Drive", 38.0062, -121.3385],
  ["Downtown Stockton", 37.9577, -121.2908],
  ["South Stockton", 37.9187, -121.2748],
  ["Brookside", 37.9788, -121.3651],
  ["Miracle Mile", 37.9752, -121.3009],
  ["Lincoln Village", 38.0094, -121.3331],
  ["University Park", 37.9685, -121.3079]
];

const QUERIES = [
  "Stockton California shooting homicide robbery arrest",
  "Stockton California police public safety",
  "Stockton California pursuit crash fire",
  "Stockton California stabbing assault gun",
  "Stockton California burglary robbery suspect",
  "site:stocktonia.org Stockton public safety",
  "site:kcra.com Stockton shooting homicide arrest",
  "site:abc10.com Stockton shooting homicide arrest",
  "site:fox40.com Stockton shooting homicide arrest",
  "site:recordnet.com Stockton crime police",
  "site:stocktonca.gov Stockton police arrest shooting",
  "site:sjgov.org sheriff Stockton arrest"
];

function googleNewsRss(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function clean(text = "") {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function classify(text) {
  const t = text.toLowerCase();

  if (/homicide|murder|killed|deadly shooting|fatal shooting/.test(t)) return "Homicide";
  if (/shooting|shots fired|gunfire|gunshot|gun/.test(t)) return "Shooting";
  if (/robbery|robbed|carjack/.test(t)) return "Robbery";
  if (/burglary|break-in|break in/.test(t)) return "Burglary";
  if (/pursuit|chase/.test(t)) return "Pursuit";
  if (/crash|collision|hit-and-run|hit and run|fatal crash|dui/.test(t)) return "Traffic";
  if (/fire|arson|smoke|burn/.test(t)) return "Fire";
  if (/missing|wanted|silver alert|amber alert/.test(t)) return "Missing";
  if (/arrest|charged|sentenced|convicted|pleads|court/.test(t)) return "Arrest";
  if (/assault|stabbing|stabbed|battery/.test(t)) return "Assault";

  return "Other";
}

function isRelevant(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();

  const stocktonRelated =
    /stockton|san joaquin|lodi|manteca|tracy|french camp/.test(text);

  const publicSafety =
    /shooting|homicide|murder|killed|robbery|burglary|arrest|police|sheriff|deputy|officer|pursuit|crash|hit-and-run|fire|missing|wanted|stabbing|assault|gun|sentenced|charged|court|suspect/.test(text);

  return stocktonRelated && publicSafety;
}

function extractLocationText(text) {
  for (const [name] of KNOWN_LOCATIONS) {
    if (text.toLowerCase().includes(name.toLowerCase())) return name;
  }

  const patterns = [
    /near ([A-Z][A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way|Highway|I-\d+))/,
    /on ([A-Z][A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way|Highway|I-\d+))/,
    /at ([A-Z][A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way|Highway|I-\d+))/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return "Stockton, CA";
}

function locationToCoords(locationText) {
  const found = KNOWN_LOCATIONS.find(([name]) =>
    locationText.toLowerCase().includes(name.toLowerCase())
  );

  if (found) {
    return {
      lat: found[1],
      lng: found[2]
    };
  }

  return STOCKTON_CENTER;
}

function sourceName(item) {
  if (item.source?.title) return item.source.title;
  if (item.creator) return item.creator;

  try {
    return new URL(item.link).hostname.replace("www.", "");
  } catch {
    return "News";
  }
}

function makeId(title, link) {
  return `${title}-${link}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 120);
}

function dedupe(stories) {
  const seen = new Map();

  for (const story of stories) {
    const key = story.title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\b(stockton|california|police|sheriff|officials|say)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);

    if (!seen.has(key)) {
      seen.set(key, story);
      continue;
    }

    const existing = seen.get(key);
    const knownUrls = new Set(existing.articles.map(a => a.url));

    for (const article of story.articles) {
      if (!knownUrls.has(article.url)) existing.articles.push(article);
    }

    if (story.summary.length > existing.summary.length) {
      existing.summary = story.summary;
    }
  }

  return [...seen.values()];
}

async function fetchGoogleNews() {
  const stories = [];

  for (const query of QUERIES) {
    console.log(`Searching: ${query}`);

    try {
      const feed = await parser.parseURL(googleNewsRss(query));

      for (const item of feed.items || []) {
        const title = clean(item.title || "");
        const summary = clean(item.contentSnippet || item.content || "");
        const link = item.link || "";
        const source = sourceName(item);

        if (!title || !isRelevant(title, summary)) continue;

        const text = `${title} ${summary}`;
        const type = classify(text);
        const location = extractLocationText(text);
        const coords = locationToCoords(location);
        const published = item.isoDate || item.pubDate || new Date().toISOString();

        stories.push({
          id: makeId(title, link),
          type,
          title,
          date: new Date(published).toISOString(),
          location,
          lat: coords.lat,
          lng: coords.lng,
          summary: summary || "Open the linked source for details.",
          status: /arrest|charged|sentenced|convicted|court/i.test(text)
            ? "Arrest / court update"
            : "Reported by news source",
          articles: [
            {
              title: source,
              url: link
            }
          ]
        });
      }
    } catch (err) {
      console.warn(`Failed query: ${query}`, err.message);
    }
  }

  return stories;
}

function loadExisting() {
  if (!fs.existsSync(OUTPUT_FILE)) return [];

  try {
    const raw = fs.readFileSync(OUTPUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  const existing = loadExisting();
  const fresh = await fetchGoogleNews();

  const combined = dedupe([...fresh, ...existing])
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 250)
    .map((item, index) => ({
      ...item,
      id: item.id || index + 1
    }));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(combined, null, 2));
  console.log(`Wrote ${combined.length} incidents to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
