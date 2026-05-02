# Serpdigger — Email Extractor Chrome Extension

Serpdigger is a Chrome extension that scrapes email addresses from [Google Custom Search Engine (CSE)](https://cse.google.com/) results. It automates search queries using configurable footprints, email patterns, locations, and secondary terms, then collects and deduplicates email addresses found in the results.

> **Version:** 3.1.0 · **Manifest:** v3

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Getting Started](#getting-started)
4. [Configuration Guide](#configuration-guide)
5. [Running a Search](#running-a-search)
6. [Downloading Results](#downloading-results)
7. [Account & Licensing](#account--licensing)
8. [Project Structure](#project-structure)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before installing Serpdigger you need:

- **Google Chrome** browser (or any Chromium-based browser that supports extensions)
- **A Google Custom Search Engine (CSE)** — set one up at <https://cse.google.com/cse/>
  1. Go to the CSE control panel and click **Add**.
  2. Enter the sites you want to search (or use `*.com` for broad searches).
  3. Click **Create** and copy the **Search engine URL** (it looks like `https://cse.google.com/cse?cx=...`).

---

## Installation

Serpdigger is loaded as an unpacked extension in Chrome Developer Mode.

### Option A — Clone with Git (recommended)

1. Open a terminal and run:
   ```bash
   git clone https://github.com/Gaby2026x/speerdiga.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `speerdiga` folder (the one that directly contains `manifest.json`).
6. The Serpdigger icon will appear in your browser toolbar.

### Option B — Download as ZIP

1. On the GitHub page, click the green **Code** button → **Download ZIP**.
2. **Extract / unzip** the downloaded file (`speerdiga-main.zip`).
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked**.
6. Browse into the **extracted folder** and select the inner `speerdiga-main` folder — this is the one that directly contains `manifest.json`.
7. The Serpdigger icon will appear in your browser toolbar.

> ⚠️ **Common error: "Manifest file is missing or unreadable"**
> This means Chrome cannot find `manifest.json` in the folder you selected. Make sure you:
> - **Extracted** the ZIP file first (don't try to load the `.zip` file itself).
> - Selected the folder that **directly contains** `manifest.json`, not a parent folder.
> - The folder name is usually `speerdiga-main` after extraction.

---

## Getting Started

1. **Click the Serpdigger icon** in the Chrome toolbar to open the popup.
2. If prompted, **log in** with your Serpdigger account username and password. Check "Remember me" to save your credentials locally.
3. **Paste your CSE URL** into the "Insert Your CSE Main Address" field (e.g. `https://cse.google.com/cse?cx=YOUR_CX_ID`).
4. Fill in at least one of the search fields below and click **START**.

---

## Configuration Guide

The popup has several fields that control the search queries:

### CSE Address
| Field | Description |
|-------|-------------|
| **Insert Your CSE Main Address** | Your Google Custom Search Engine URL. This is where all queries are sent. Must start with `https://cse.google.com/...`. |

### Search Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Site footprint** | Site-specific search operators. Use the dropdown for presets or type custom footprints (one per line). | `site:linkedin.com/in/` |
| **@ Patterns** | Email domain patterns to search for (one per line). Must start with `@`. | `@gmail.com` |
| **Location** | Location-based search terms (one per line). Check "Exact match" to wrap in quotes. | `New York` |
| **Secondary Terms** | Additional keywords to combine with other fields (one per line). Check "Exact match" to wrap in quotes. | `CEO` |

All non-empty fields are combined into a **cartesian product** — every combination of footprint × pattern × location × secondary term becomes one query.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| **Delay b/w queries** | Seconds to wait between queries (0–99). Helps avoid rate limiting. | `10` |
| **Remove duplicates** | When checked, duplicate emails are removed from results. | `checked` |

All field values and options are **automatically saved** to Chrome local storage and restored when you reopen the popup.

---

## Running a Search

1. Fill in your desired search fields (at least one non-empty field is required).
2. Click **START**. The button changes to **STOP** while running.
   - The extension opens your CSE in the active tab and begins processing pages.
   - **Progress** is shown: current query number / total queries.
   - **Collected emails** count updates in real time.
3. The extension automatically paginates through each query's results before moving to the next query.
4. To **stop early**, click **STOP**. You can still download any emails collected so far.
5. When all queries complete, the progress shows **Complete**.

> ⚠️ **Keep the popup open** while the scraper runs. Closing it does not stop the background process, but you will not see live UI updates until you reopen it.

---

## Downloading Results

- Click **DOWNLOAD** to save all collected emails as a `.txt` file.
- The file is named `serpdigger_DD-MM-YYYY_HH-MM.txt`.
- Each email is on its own line.
- **Trial accounts** are limited to **100 emails** per download; paid accounts have no limit.

---

## Account & Licensing

| Status | Description |
|--------|-------------|
| **✓ Activated** (green) | Paid account — unlimited email downloads. |
| **Trial Account** (orange) | Free/trial — downloads limited to 100 emails. |

- Log in via the modal that appears on first use.
- Credentials can be saved locally with "Remember me".
- Account status is checked against the Serpdigger authentication server each time the popup opens.

---

## Project Structure

```
speerdiga/
├── manifest.json              # Chrome extension manifest (v3)
├── README.md                  # This file
│
├── background/                # Background service worker scripts
│   ├── service-worker.js      # Service worker entry point
│   ├── index.js               # Global config & state
│   ├── api.js                 # API calls (auth, footprints)
│   ├── account.js             # Account storage (save/load/clear)
│   ├── communication.js       # Message listener router
│   └── runner.js              # Query runner, tab control, download
│
├── content/                   # Content scripts (injected into pages)
│   ├── duckduckgo.js          # Email extraction from CSE results
│   ├── patch-worker.js        # Web Worker proxy shim
│   ├── worker.js              # Simple worker tick
│   └── ajax-patch.js          # AJAX polyfill
│
├── popup/                     # Extension popup UI
│   ├── popup.html             # Main popup layout (Bootstrap 3)
│   ├── popup.js               # Init & version display
│   ├── login.js               # Login modal & account check
│   ├── footprints.js          # Footprint dropdown management
│   ├── query.js               # Query building, storage & restore
│   └── runner.js              # Start/stop/download buttons & progress
│
├── includes/                  # Shared libraries
│   ├── jquery.js              # jQuery 1.x
│   ├── bootstrap.js           # Bootstrap 3.x JS
│   ├── bootstrap.css          # Bootstrap 3.x CSS
│   └── logs.js                # Logging utility
│
└── logo/                      # Extension icons
    ├── logo-16.png
    ├── logo-48.png
    └── logo-128.png
```

### Message Flow

The extension uses Chrome's messaging API for communication:

```
Popup                    Background                Content Script
  │                          │                          │
  │── account:check ────────►│                          │
  │◄──── {paid: bool} ──────│                          │
  │                          │                          │
  │── serpdigger.run() ─────►│                          │
  │                          │── tab.update(CSE URL) ──►│
  │                          │── "run" ────────────────►│
  │                          │                          │── extracts emails
  │                          │◄── "runner:update" ──────│
  │◄── updateEmails() ──────│                          │
  │                          │◄── "runner:finish" ──────│
  │                          │── next query / finish ───│
  │                          │                          │
  │── serpdigger.download()─►│                          │
  │                          │── chrome.downloads ──────│
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Manifest file is missing or unreadable"** | You selected the wrong folder. Make sure you extracted the ZIP file first, then select the folder that **directly contains** `manifest.json` (e.g. `speerdiga-main`), not its parent. |
| Extension doesn't appear in toolbar | Make sure Developer Mode is enabled and the extension is loaded from the correct folder. |
| "Checking account..." stays forever | The authentication server may be unreachable. The extension still works in trial mode. |
| No emails found | Verify your CSE URL is correct and returns results. Check that your `@ Patterns` use valid email domains (e.g. `@gmail.com`). |
| Queries run but pages don't load | Increase the **Delay** between queries — Google may be rate-limiting your requests. |
| Download only has 100 emails | You are on a trial account. Upgrade to a paid account for unlimited downloads. |
| Extension crashes on start | Ensure at least one search field has content. Empty queries will not run. |
| Popup UI looks broken | Make sure no other extensions are interfering. Try reloading the extension from `chrome://extensions/`. |

---

## License

This project is provided as-is. See the repository for any licensing information.