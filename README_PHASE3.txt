# Phase 3 Auto Update

This adds automatic updates for your map.

## What this does

Every 30 minutes, GitHub Actions runs:

```bash
npm run update
```

That script searches Google News RSS for Stockton public safety stories, classifies them, adds approximate map coordinates, deduplicates stories, and updates:

```text
incidents.json
```

Your website does not need to scrape anything. It just loads `incidents.json`.

## Files to add to your repo

Copy these into your GitHub repository:

```text
package.json
scripts/update-incidents.js
.github/workflows/update-incidents.yml
```

Keep your existing:

```text
stockton_crime_tracker_v1_phase1.html
incidents.json
```

## First setup

After pushing these files to GitHub:

1. Go to your repo.
2. Click **Actions**.
3. Enable workflows if GitHub asks.
4. Click **Update Incidents**.
5. Click **Run workflow**.

After it runs, it should update `incidents.json`.

## Important

This uses Google News RSS. It is much more reliable than trying to scrape individual news websites directly, but it is still not perfect.

Some articles will map only to general Stockton coordinates if the title/summary does not include a clear street or neighborhood.
