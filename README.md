# Paris Email Extractor — Advanced Email Discovery Chrome Extension

Paris Email Extractor is an advanced Chrome extension that discovers and extracts email addresses from search engine results with enhanced accuracy and validation. It supports multiple search engines (Google CSE, Google Web Search, Bing) and includes specialized extraction patterns for professional networks like LinkedIn, Apollo.io, and ZoomInfo.

> **Version:** 4.0.0 · **Manifest:** v3

---

## ✨ New Features in v4.0

### Enhanced Email Extraction
- **Advanced Regex Patterns**: RFC 5322 compliant email detection with support for internationalized domains
- **Obfuscated Email Detection**: Automatically finds emails hidden as "name [at] domain [dot] com", "name(at)domain(dot)com", etc.
- **Confidence Scoring**: Each extracted email receives a confidence score based on validation criteria
- **Platform-Specific Extraction**: Specialized patterns for LinkedIn, Apollo.io, ZoomInfo, and other professional platforms

### Improved Validation & Filtering
- **Expanded ISP Detection**: Identifies personal email providers (Gmail, Yahoo, etc.) across 50+ domains
- **Role-Based Email Filtering**: Detects and optionally filters noreply@, admin@, and other non-decision-maker addresses
- **Disposable Email Detection**: Identifies temporary/throwaway email services
- **Enhanced Junk Filtering**: Removes file extensions, test domains, and other false positives

### Deep Scanning Enhancements
- **Multiple Extraction Methods**: Scans mailto: links, JSON-LD structured data, meta tags, and data attributes
- **HTML Entity Decoding**: Properly handles &nbsp;, &quot;, and other encoded content
- **Platform Detection**: Automatically adjusts extraction strategy based on source (LinkedIn, Apollo, etc.)
- **Increased Coverage**: Extracts from contact cards, profile sections, and hidden data attributes

### Professional Network Support
- **LinkedIn**: Optimized patterns for profile pages (/in/) and company pages
- **Apollo.io**: Extracts from people directories and contact databases
- **ZoomInfo**: Detects emails from company and people profiles
- **Combined Searches**: Built-in footprints that search multiple platforms simultaneously

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

Before installing Paris Email Extractor you need:

- **Google Chrome** browser (or any Chromium-based browser that supports extensions)
- **A Google Custom Search Engine (CSE)** — set one up at <https://cse.google.com/cse/>
  1. Go to the CSE control panel and click **Add**.
  2. Enter the sites you want to search (or use `*.com` for broad searches).
  3. Click **Create** and copy the **Search engine URL** (it looks like `https://cse.google.com/cse?cx=...`).

---

## Installation

Paris Email Extractor is loaded as an unpacked extension in Chrome Developer Mode.

### Option A — Clone with Git (recommended)

1. Open a terminal and run:
   ```bash
   git clone https://github.com/LOBEG/sedjer.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `sedjer` folder (the one that directly contains `manifest.json`).
6. The Paris Email Extractor icon will appear in your browser toolbar.

### Option B — Download as ZIP

1. On the GitHub page, click the green **Code** button → **Download ZIP**.
2. **Extract / unzip** the downloaded file (`sedjer-main.zip`).
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked**.
6. Browse into the **extracted folder** and select the inner `sedjer-main` folder — this is the one that directly contains `manifest.json`.
7. The Paris Email Extractor icon will appear in your browser toolbar.

> ⚠️ **Common error: "Manifest file is missing or unreadable"**
> This means Chrome cannot find `manifest.json` in the folder you selected. Make sure you:
> - **Extracted** the ZIP file first (don't try to load the `.zip` file itself).
> - Selected the folder that **directly contains** `manifest.json`, not a parent folder.
> - The folder name is usually `speerdiga-main` after extraction.

---

## Getting Started

1. **Click the Paris Email Extractor icon** in the Chrome toolbar to open the popup.
2. If prompted, **log in** with your account username and password. Check "Remember me" to save your credentials locally.
3. **Select your search engine**: Choose between Google CSE, Google Web Search, or Bing Search.
4. **Paste your CSE URL** (if using CSE mode) into the "Insert Your CSE Main Address" field (e.g. `https://cse.google.com/cse?cx=YOUR_CX_ID`).
5. Fill in at least one of the search fields below and click **START**.

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
| **Site footprint** | Site-specific search operators. Use the dropdown for presets (including LinkedIn, Apollo.io, ZoomInfo) or type custom footprints (one per line). | `site:linkedin.com/in/` or `site:apollo.io` |
| **@ Patterns** | Email domain patterns to search for (one per line). Must start with `@`. | `@gmail.com` or `@company.com` |
| **Location** | Location-based search terms (one per line). Check "Exact match" to wrap in quotes. | `New York` or `San Francisco` |
| **Secondary Terms** | Additional keywords to combine with other fields (one per line). Check "Exact match" to wrap in quotes. | `CEO` or `founder` |

All non-empty fields are combined into a **cartesian product** — every combination of footprint × pattern × location × secondary term becomes one query.

### Preset Footprints

The extension includes powerful preset footprints for:
- **LinkedIn Profile Contacts**: Searches LinkedIn profiles with contact information
- **LinkedIn Company Pages**: Extracts from company pages
- **Apollo.io Profiles**: Targets Apollo.io people directories
- **ZoomInfo Contacts**: Searches ZoomInfo professional profiles
- **Data Platforms Combined**: Searches across LinkedIn, Apollo, and ZoomInfo simultaneously
- **C-Suite Executives**: Pre-configured searches for CEO, CFO, CTO, CMO, etc.
- **Sales & Marketing Roles**: VP Sales, Marketing Director, Account Executive, etc.
- **IT & Engineering**: Software Engineers, DevOps, Data Scientists, etc.
- **Member Directories**: Association members, chamber of commerce, professional directories

### Options

| Option | Description | Default |
|--------|-------------|---------|
| **Search Engine** | Choose between Google CSE, Google Web Search, or Bing Search | `Google CSE` |
| **Delay b/w queries** | Seconds to wait between queries (0–99). Helps avoid rate limiting. | `10` |
| **Pages per query** | Number of result pages to scan per query (1-100) | `10` |
| **Remove duplicates** | When checked, duplicate emails are removed from results. | `checked` |
| **Deep Scan pages** | When checked, follows result links to extract emails from full pages (much higher yield) | `checked` |
| **MX CHECK** | Validates email domains using DNS MX record lookup | `Available after extraction` |

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
- The file is named `paris-email-extractor_DD-MM-YYYY_HH-MM.txt`.
- Each email is on its own line.
- Use **MX CHECK** button to validate emails, then download valid or invalid emails separately.
- **Trial accounts** are limited to **100 emails** per download; paid accounts have no limit.

### MX Validation

The MX CHECK feature validates email addresses by checking if their domains have valid MX (Mail Exchange) records:
1. Click **MX CHECK** after extraction completes
2. The extension queries DNS servers (Google DNS and Cloudflare fallback) to verify each domain
3. Results show:
   - **Valid (has MX)**: Domains with working mail servers
   - **Invalid (no MX)**: Domains without mail servers (likely invalid)
4. Download valid or invalid emails separately using the buttons in the results panel

---

## Account & Licensing

| Status | Description |
|--------|-------------|
| **✓ Activated** (green) | Paid account — unlimited email downloads. |
| **Trial Account** (orange) | Free/trial — downloads limited to 100 emails. |

- Log in via the modal that appears on first use.
- Credentials can be saved locally with "Remember me".
- Account status is checked against the authentication server each time the popup opens.

---

## Advanced Features

### Email Extraction Enhancements

**Multiple Pattern Detection**:
- Standard RFC 5322 email format: `user@domain.com`
- Lenient format with spaces: `user @ domain . com`
- Obfuscated formats:
  - `user [at] domain [dot] com`
  - `user (at) domain (dot) com`
  - `user AT domain DOT com`
  - `user <at> domain <dot> com`

**Platform-Specific Extraction**:
- **LinkedIn**: Extracts from profile contact sections, about sections, and company pages
- **Apollo.io**: Targets data-email attributes and structured contact data
- **ZoomInfo**: Extracts from people directories and company profiles
- **Generic Pages**: Scans mailto: links, JSON-LD data, meta tags, and visible text

**Deep Scanning**:
When enabled, the extension:
1. Collects URLs from search result links
2. Fetches full HTML content of each page (up to 30 per query)
3. Extracts emails from:
   - `mailto:` links
   - JSON-LD structured data (`application/ld+json`)
   - Meta tags (og:email, contact, etc.)
   - Data attributes (data-email, data-contact)
   - Decoded HTML entities
   - Plain text content
4. Applies intelligent filtering to remove junk emails

**Intelligent Filtering**:
- Removes personal email domains (Gmail, Yahoo, Outlook, etc.)
- Filters role-based emails (noreply@, admin@, webmaster@, etc.)
- Excludes test domains (example.com, test.com, etc.)
- Removes file extensions disguised as emails
- Detects disposable/temporary email services

### Confidence Scoring

Each extracted email receives a confidence score (0-100) based on:
- **Source**: Where the email was found (standard: 90, obfuscated: 80, etc.)
- **Domain Type**: Business domains score higher than ISP domains
- **Format**: Emails with firstname.lastname format score higher
- **Validation**: Passes basic format validation rules

---

## Best Practices for Maximum Results

### 1. Use Deep Scan
Enable "Deep Scan pages" to extract from full web pages, not just search result snippets. This dramatically increases email yield.

### 2. Combine Search Strategies
Use the preset multi-query footprints like:
- "★ LinkedIn + Apollo Combined Search" for professional emails
- "★ All C-Suite Roles" for executive contacts
- "★ Data Platforms Combined" to search multiple sources at once

### 3. Optimize Query Delay
- Set delay to 10-15 seconds for CSE to avoid rate limiting
- Use 3-5 seconds for direct Google/Bing search
- Increase delay if you see CAPTCHA or blocking

### 4. Use Exact Match for Location
Check "Exact match" for location fields to get more precise geographic targeting (e.g., "New York" vs New York everywhere in page).

### 5. Validate with MX Check
Always run MX validation before using emails to:
- Remove invalid/defunct domains
- Increase deliverability rates
- Ensure email list quality

### 6. Filter by Email Type
Use the Email Type dropdown to target:
- **Business (exclude ISP)**: Gets company emails only, no personal addresses
- **Office 365 / Google Workspace**: Targets businesses using these platforms
- **Specific Industries**: .edu for education, .gov for government

---

## Project Structure

```
sedjer/
├── manifest.json              # Chrome extension manifest (v3)
├── README.md                  # This file
│
├── background/                # Background service worker scripts
│   ├── service-worker.js      # Service worker entry point
│   ├── index.js               # Global config & state
│   ├── api.js                 # API calls (auth, footprints) - Enhanced with LinkedIn/Apollo/ZoomInfo
│   ├── account.js             # Account storage (save/load/clear)
│   ├── communication.js       # Message listener router
│   └── runner.js              # Query runner, tab control, download - Enhanced deep scanning
│
├── content/                   # Content scripts (injected into pages)
│   ├── email-extractor.js     # NEW: Advanced email extraction module with validation
│   ├── duckduckgo.js          # Email extraction from search results - Enhanced
│   ├── patch-worker.js        # Web Worker proxy shim
│   ├── worker.js              # Simple worker tick
│   └── ajax-patch.js          # AJAX polyfill
│
├── popup/                     # Extension popup UI
│   ├── popup.html             # Main popup layout (Bootstrap 3) - Updated branding
│   ├── popup.js               # Init & version display
│   ├── login.js               # Login modal & account check
│   ├── footprints.js          # Footprint dropdown management
│   ├── email-filter.js        # Email type preset filters
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
| **"Manifest file is missing or unreadable"** | You selected the wrong folder. Make sure you extracted the ZIP file first, then select the folder that **directly contains** `manifest.json` (e.g. `sedjer-main`), not its parent. |
| Extension doesn't appear in toolbar | Make sure Developer Mode is enabled and the extension is loaded from the correct folder. |
| "Checking account..." stays forever | The authentication server may be unreachable. The extension still works in trial mode. |
| No emails found | Verify your search settings: (1) Check CSE URL is correct, (2) Try enabling Deep Scan for higher yield, (3) Use preset footprints like "★ LinkedIn Profile Contacts", (4) Ensure @ Patterns are valid (e.g. `@gmail.com`). |
| Very few emails extracted | Enable "Deep Scan pages" option — this dramatically increases results by fetching full pages. Disable it only if you want faster, snippet-only extraction. |
| Queries run but pages don't load | Increase the **Delay** between queries to 15-20 seconds. Google/Bing may be rate-limiting your requests. Also reduce "Pages per query" to 5-10. |
| LinkedIn/Apollo/ZoomInfo not working | These platforms may block automated access. For best results: (1) Use the preset footprints, (2) Combine with other search terms, (3) Consider using their official APIs for large-scale extraction. |
| Download only has 100 emails | You are on a trial account. Upgrade to a paid account for unlimited downloads. |
| Extension crashes on start | Ensure at least one search field has content. Empty queries will not run. |
| Popup UI looks broken | Make sure no other extensions are interfering. Try reloading the extension from `chrome://extensions/`. |
| MX validation is slow | MX validation queries DNS servers for each unique domain. For large lists (1000+ emails), this can take several minutes. Results are batched to avoid overwhelming DNS servers. |
| Getting obfuscated emails | The extractor now detects obfuscated patterns like "name [at] domain [dot] com" and automatically converts them to standard format. |

---

## Limitations & Legal Notice

### Rate Limiting
- Google CSE: Limited to 100 queries per day on free tier
- Google/Bing direct search: May show CAPTCHAs with high query volume
- Recommendation: Use delays of 10-15 seconds between queries

### Platform Access
- **LinkedIn, Apollo.io, ZoomInfo**: These platforms have Terms of Service that restrict automated data collection
- The extension includes search patterns for finding publicly available contact information, but users should:
  - Review each platform's Terms of Service before use
  - Consider using official APIs for large-scale access
  - Respect rate limits and access restrictions
  - Ensure compliance with GDPR, CCPA, and other privacy regulations

### Data Usage
- Extracted emails should only be used for legitimate business purposes
- Always provide opt-out mechanisms in communications
- Comply with CAN-SPAM, GDPR, and other anti-spam regulations
- Do not use for unsolicited bulk email (spam)

---

## License

This project is provided as-is. See the repository for any licensing information.