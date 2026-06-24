# Stockton Incident Map — News Aggregator V1

This version does not use CAD at all.

It pulls public safety stories from:
- Google News RSS searches
- KCRA RSS
- Stocktonia Public Safety RSS/page
- Source-specific Google News searches for ABC10, FOX40, The Record, Stocktonia, KCRA

Then it:
- Filters for Stockton/San Joaquin public safety terms
- Classifies incidents
- Deduplicates similar stories
- Extracts likely location text
- Geocodes approximate marker locations
- Displays them on a Leaflet map

## Run on Mac

Install Node.js LTS from nodejs.org.

Then open Terminal in this folder and run:

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Important limitations

This is not a perfect "all news" machine yet.

Some outlets block scraping or do not provide full RSS feeds. Google News RSS helps discover stories, but locations may be incomplete. The app maps stories to Stockton city center when it cannot extract a street or intersection.

For production, the next step would be:
- Database cache
- Better geocoding
- Article body extraction
- Admin review screen
- Optional paid search API like SerpAPI, Bing News Search, or GNews
