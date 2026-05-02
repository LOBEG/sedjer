# Changelog

All notable changes to Paris Email Extractor will be documented in this file.

## [4.5.0] - 2026-05-02

### 🎯 Footprint-named saves · Cleaner extractions · Programmable Search Engine

#### Footprint name in saved filenames
- When you run `paris footprint Apollo --desktop` (or save from the menu), the file is now named after the footprint that produced it — e.g. `paris-Apollo.io-2026-05-02_15-30-12.csv` — instead of the generic `paris-footprint-…`.
- `extract --desktop` now uses the URL's hostname (`paris-acme.com-…`); `search` uses a 4-word slug of the query; `permute` uses `first.last@domain`; `mx` uses the first email's domain. Every saved file is self-describing at a glance.
- Filenames are sanitised for cross-platform safety (NFKD-normalised, diacritics stripped, illegal chars replaced, clamped to 60 chars).

#### Strip social-platform prefixes glued to emails
- Emails like `facebookjohn@gmail.com` and `linkedinjane@example.com` — caused by screen-reader-only platform-name spans collapsing onto the email's local-part during HTML tag-stripping — are now automatically cleaned to `john@gmail.com` / `jane@example.com`.
- New `EmailExtractor.stripGluedPlatformPrefix()` runs inside `addEmail()` so both content scripts (extension) and the service worker (deep-scan) and the CLI all benefit from a single source of truth. The list covers ~50 platform names: Facebook, LinkedIn, Twitter, Instagram, YouTube, TikTok, Pinterest, Snapchat, Reddit, GitHub, GitLab, Medium, Telegram, WhatsApp, Discord, Twitch, Vimeo, Dribbble, Behance, Threads, Mastodon, Tumblr, Substack, Quora, plus generic UI labels (`email`, `mail`, `contact`, `social`).
- Safe by design: only strips when there is no separator (`./_/-/+`) between the prefix and the rest, AND the remainder is still a sane local-part (≥ 3 chars, ≥ 1 letter). Real addresses such as `facebook.tech@meta.com` are untouched.

#### Drop hidden / honeypot emails
- Both `cli/paris.js#htmlToScannable` and `background/runner.js#_deepFetchPage` now strip hidden subtrees **before** the email regex sees them. Removed: elements with `display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, the `hidden` HTML attribute, `aria-hidden="true"`, and the conventional screen-reader-only classes (`sr-only`, `visually-hidden`, `screen-reader-text`, `u-hidden-visually`, `hidden-visually`, `element-invisible`, `usa-sr-only`). HTML comments are also dropped (they sometimes preserve stale honeypot addresses).
- Two passes catch one level of nesting (hidden→hidden), enough for the ~99% case.

#### Powerful Programmable Search Engine bundle  (`cse/`)
- New **`cse/paris-cse-annotations.xml`** — drop-in annotation set for [Google Programmable Search Engine](https://programmablesearchengine.google.com). Auto-generated from all 1062 built-in footprints; boosts ~70 lead-gen domains (LinkedIn, Apollo, ZoomInfo, RocketReach, Crunchbase, Wellfound, GitHub, Substack, Behance, Dribbble, Stack Overflow Careers, …) and excludes 23 known noise sites (TripAdvisor, Pinterest, Yelp, lyrics farms, Web Archive, …).
- New **`cse/CSE.md`** — 60-second setup guide with copy-paste import instructions and the three ways to plug your `cx` back into the program.
- New **`cse/build-cse.js`** — regenerator. Re-run after editing footprints to refresh the bundle.
- New CLI flag **`--cse <cx>`** (and `PARIS_CSE_CX` env var, and menu option 8 → "CSE engine ID (cx)") — when provided, `paris search` and `paris footprint` route through Google's public Programmable Search Engine results page instead of the DDG HTML scraper. **No API key required.** Falls back to DuckDuckGo automatically if the engine returns 0 hits or fails.
- All existing flags (`--country`, `--follow-contact`, `--mx`, `--include-isp`, `--strict`, `--desktop`, history filtering, …) work identically with the CSE path.

### Compatibility
- Browser-extension behaviour for end-users is **unchanged** apart from the prefix-stripping and hidden-element-stripping bug fixes (they fire automatically; no UI to enable).
- CLI behaviour is fully backward-compatible: existing scripts continue to work; CSE is opt-in.

---

## [4.4.0] - 2026-05-02

### 🧭 Interactive Menu · Save-to-Desktop · Higher Recall

#### Interactive menu — auto-launches when the .exe is double-clicked
- Running the program with **no arguments** (or via `paris menu` / `paris interactive` / `paris -i`) now opens a numbered menu listing every feature on screen. No need to remember commands or type `--help`.
- Menu options: **1)** extract from URL/file · **2)** web search · **3)** run a built-in footprint (with searchable matcher) · **4)** browse 1062 footprints (paged) · **5)** generate corporate email permutations · **6)** MX-validate emails · **7)** persistent history (stats / list / export / clear) · **8)** session settings (skip-seen, strict mode, default country, save folder, follow-contact, max-pages) · **9)** full feature reference · **0)** exit.
- Every prompt shows a default in `[brackets]`; press Enter to accept. Defaults are stored in a session-level `INTERACTIVE_SETTINGS` so subsequent actions inherit them.
- After every action the menu offers **"Save these results to your Desktop? [Y/n]"** and writes a timestamped file like `paris-extract-2026-05-02_15-30-12.csv` to `~/Desktop/` (or the configured save folder). The runner pauses with `Press Enter to close…` on Windows TTYs so a double-clicked console window doesn't disappear.
- Menu uses a custom line-event readline wrapper so it behaves correctly on a real TTY *and* with piped stdin (smoke tests, scripts).

#### `--desktop` flag for one-shot CLI use
- New flag on `extract`, `search`, `footprint`, `permute`, `mx`, and `history list`: `--desktop` writes the output to `~/Desktop/paris-<command>-<timestamp>.<ext>` with the right extension for the chosen `--format`.
- New `resolveDesktopPath()` resolves the user's Desktop on Windows / macOS / Linux including OneDrive-redirected paths (`%OneDrive%\Desktop`, `%USERPROFILE%\OneDrive\Desktop`); falls back to `~/Desktop` (creating it if needed), then `~`, then CWD. Filenames are sanitised and timestamped.

#### Higher email-extraction recall by default
- Default `--min-confidence` lowered from **30 → 0** for the CLI (`extract` / `search` / `footprint`). The previous threshold was discarding real leads — ISP/role/disposable filters still keep the result quality high.
- New `--strict` flag restores the v4.2/4.3 behaviour (`--min-confidence 30`) for users who relied on it.
- `extractFromHtml` fallback default also lowered to 0 for consistency.

#### Documentation
- `DESKTOP.md` rewritten around the menu: new TL;DR is "build once, double-click the .exe, pick a number". Adds a full menu walkthrough, a save-folder resolution table per OS, and a troubleshooting row for the two confusion sources reported by users ("the exe doesn't open" and "email extraction is too low").
- README v4.4 callout added.
- `package.json` and `manifest.json` bumped to **4.4.0** in lockstep.

#### Compatibility
- All existing footprints, regex, message events, storage keys, runner-finish hook semantics, and the Manifest V3 bundle are unchanged.
- Every existing CLI flag still works exactly as before. `paris --help` / `paris -h` still print the reference; only the **no-args** path changed (it used to print help, it now launches the menu — `paris help` and `paris --help` still print help for scripts that depended on that).
- The browser extension is **not affected** — `package.json` and `cli/` are ignored by Manifest V3.

## [4.3.0] - 2026-05-02

### 📅 Persistent History · Facebook & Lead-Gen Platforms · Desktop Guide

#### Persistent extraction history (skip-seen by default)
- New CLI module: every emitted email is recorded in `~/.paris-email-extractor/history.json` (override with `--history PATH` or `PARIS_HISTORY` env) with `firstSeen` / `lastSeen` timestamps, source URL, footprint name and command. **Re-running the same footprint never re-emits emails already in the history.**
- New flags on `extract` / `search` / `footprint`:
  - `--no-skip-seen` — disable the filter for this run
  - `--since YYYY-MM-DD` / `--until YYYY-MM-DD` — only re-emit emails first seen in a date window
  - `--history PATH` — override history-file location
  - `--after YYYY-MM-DD` / `--before YYYY-MM-DD` — inject Google `after:` / `before:` operators into the search query for date-bounded discovery
- New `paris history` sub-command: `stats`, `list [--format json|csv|txt]`, `export FILE`, `clear --yes`. Saving to disk runs on `exit`/`SIGINT`/`SIGTERM`/`SIGHUP` so partial runs aren't lost.
- **Browser extension parity:** popup gains a "Skip emails seen in previous runs" checkbox + "Clear seen-history" button + live counter. The runner loads `chrome.storage.local.seenEmails` at the start of each run, drops any email already known, and appends new ones at the end of every run regardless of whether skip-seen was active.

#### Facebook + every other lead-generation platform (43 new footprints)
Adds first-class footprints for: **Facebook (Pages, Profiles & About, Groups & Marketplace)**, Instagram bio emails, TikTok, X/Twitter, Reddit, YouTube channels & About, Pinterest, Threads, Telegram, Discord, Mastodon/Fediverse, WhatsApp Business, Quora, Medium, Substack, Behance, Dribbble, Vimeo, Twitch, Stack Overflow, GitLab, Bitbucket, Product Hunt, Indie Hackers, AngelList Talent / Wellfound, Glassdoor, Indeed, Monster, ZipRecruiter, F6S, PitchBook, CB Insights, Owler, Datanyze, ContactOut & SalesQL, Wiza, Snov.io & Kaspr, FindThatLead & GetEmail.io, Skrapp & AnymailFinder, Voila Norbert, plus a **★ All Social & Lead-Gen Platforms** combined entry that fans 20+ platforms into 3 mega-queries.

Total built-in footprints: **1019 → 1062 (+43 additive)**.

#### Desktop / standalone executable guide
Adds **`DESKTOP.md`** with explicit step-by-step instructions for running the standalone program on Windows, macOS, and Linux:
- prerequisites, global install via `npm install -g .`, building single-file binaries via `npm run build:exe[:win|:mac|:linux]`, sample run-commands per OS
- complete reference of every CLI command + flag (incl. all new history/date flags)
- 8 ready-made recipes (date-bounded scrape, daily-delta extraction with separate history per project, MX-validate piped lists, history backup/restore, …)
- explanation of the history file format and default location per OS
- troubleshooting table for the most common failure modes

#### Compatibility
- All existing footprints, regex, message events, storage keys, APIs and the Manifest V3 bundle are unchanged.
- Default skip-seen behaviour for the **CLI** is **on** so re-runs deduplicate automatically. Pass `--no-skip-seen` for the v4.2 behaviour. Default for the **extension** is **off** (must be enabled via the new checkbox) so existing users see no behaviour change.
- `package.json` and `manifest.json` bumped to **4.3.0** in lockstep.

## [4.2.0] - 2026-05-02

### 🌍 Global Coverage, Country Targeting & Deeper DB Scan

#### Country targeting (new feature)
- **70 country footprints** added to `background/api.js` — each entry generates 5 site-TLD-restricted queries that pull decision-maker contacts from local company sites + the major B2B platforms (LinkedIn / Apollo / RocketReach / Hunter / Crunchbase / ZoomInfo). Coverage:
  - Americas: US, CA, BR, MX, AR, CL, CO, PE, VE, UY
  - Europe (full EU + non-EU): UK/IE, DE, FR, ES, IT, NL, BE, CH, AT, SE, NO, DK, FI, IS, PT, GR, PL, CZ, SK, HU, RO, BG, HR, SI, RS, EE, LV, LT, RU, UA, BY
  - Asia-Pacific: IN, SG, HK, MY, ID, TH, PH, VN, JP, KR, CN, TW, AU, NZ
  - Middle East & Africa: AE, SA, QA, KW, BH, OM, IL, TR, EG, MA, ZA, NG, KE, GH
- **Popup country dropdown** (`#country-select`) with all 70 countries + a "Restrict to TLD" checkbox. When set, every query the extension fires gets a `site:.<tld>` prefix. Persisted via `chrome.storage.local.country` and `chrome.storage.local.countryRestrictTld`. Defaults to "Any country / Global" so existing users see no behaviour change.
- **CLI: `--country CC`** flag on `search` / `footprint` (ISO 3166-1 alpha-2). Unknown codes log a warning and continue without filtering. Backed by `COUNTRY_TLDS` map mirrored 1:1 between extension and CLI to keep behaviour consistent.

#### Global industries
- **20 globally-flavoured industry footprints** complementing the existing 119 SOC + 21+ tech-focused industry blocks: Telecommunications, Logistics & Supply Chain, Insurance, Real Estate & PropTech, Hospitality & Tourism, Construction & Infrastructure, Mining & Metals, Oil/Gas & Energy, Renewable Energy, Agriculture & Agritech, Pharma & Life Sciences, Healthcare Providers, Education & EdTech, Government & Public Sector, NGOs, Media & Publishing, Banking & Capital Markets, Retail & Consumer Goods, Automotive & Mobility, Aviation & Airlines.

#### Deep DB extraction
- **`--follow-contact`** flag on CLI `extract` and `search`. After fetching a result page, also fetches a fixed set of well-known contact-related sub-paths at depth 1: `/contact`, `/contact-us`, `/about`, `/about-us`, `/team`, `/our-team`, `/people`, `/staff`, `/leadership`, `/management`, `/directory`, `/employees`, `/impressum`. Sub-page fetches run with concurrency 3-4 and a 15s timeout each, sharing the de-dup set with the main page so emails appear once regardless of which page surfaces them.

#### Robustness fixes
- CLI footprint loader now strips `//` line comments and `/* */` block comments before bracket-balanced parsing of `_builtinFootprints`. Previously an apostrophe inside a JS comment would put the loader into a phantom string state and break parsing.

#### Compatibility
- Total built-in footprint count: 919 → 1019 (+100 additive entries).
- All existing footprints, regex patterns, message events, storage keys, and APIs are unchanged.
- Browser extension: Manifest V3 bundle still loads identically — only `popup/popup.html` and `popup/query.js` were extended (additive new row + new functions), with all changes guarded by `$('#country-select').length` so they no-op cleanly if the new UI elements aren't present.
- Standalone executable build path (`npm run build:exe`) is unchanged.

## [4.1.0] - 2026-05-02

### 🚀 Extended Coverage & Standalone Executable

#### New built-in footprints (additive — existing entries unchanged)
- **★ Crunchbase Profiles** — `site:crunchbase.com/person/` and `/organization/` searches
- **★ RocketReach Profiles** — direct `site:rocketreach.co` queries
- **★ Lusha Contacts** — `site:lusha.com` with email/contact matchers
- **★ Hunter.io Discovery** — `site:hunter.io` and `/companies` searches
- **★ Clearbit Profiles** — `site:clearbit.com` and `connect.clearbit.com`
- **★ SignalHire Profiles** — `site:signalhire.com` searches
- **★ Salesfully / Salesintel / Lead411** — combined data-vendor query
- **★ AngelList / Wellfound Founders** — founder/CEO targeted on `angel.co` + `wellfound.com`
- **★ GitHub Public Email Leaks** — picks up `*.users.noreply.github.com` and org contact pages
- **★ Extended Data Platforms Combined** — multi-`site:` OR query across all the above

#### Enhanced extraction
- **International (RFC 6531 / IDN) email regex** — picks up addresses with non-ASCII local parts and IDN domains (e.g. `müller@straße.de`, `用户@例子.广告`) that the strict ASCII regex skipped. Runs only when text actually contains non-ASCII characters; safely no-ops on older runtimes lacking Unicode property escape support.
- **`EmailExtractor.generatePermutations(firstName, lastName, domain, opts)`** — generates the most common corporate email permutations (`firstname.lastname@`, `flastname@`, `firstnamel@`, reversed forms, etc.). Strips diacritics and apostrophes (`José Müller` → `jose.muller@…`, `Jane O'Connor` → `jane.oconnor@…`). Useful when discovery surfaces a name but no email — candidates can then be MX-validated.
- **Configurable deep-scan concurrency** — `chrome.storage.local.deepScanConcurrency` (default 6) caps in-flight `_deepFetchPage` requests via a queue+slot pool, preventing storms when a SERP page yields dozens of links. Set to `0` for unlimited (legacy behaviour).

#### Standalone CLI / Executable
- **New `cli/paris.js`** — Node.js CLI that re-uses the same `EmailExtractor` module the browser extension uses (so detection/validation are bit-identical between channels). Subcommands:
  - `extract <url|file>` — pull emails from a remote URL or local HTML/text file
  - `search "<query>"` — DuckDuckGo HTML SERP scrape + parallel deep-scan
  - `footprint "<name-substring>"` — run a built-in footprint by name match
  - `list-footprints [filter]` — list all built-in footprints
  - `permute <first> <last> <domain>` — generate corporate permutations
  - `mx <email...>` — MX-validate via Node DNS
- **Common flags**: `--out`, `--format json|csv|txt`, `--max-pages`, `--concurrency`, `--include-isp`, `--include-roles`, `--min-confidence`, `--domain`, `--mx`.
- **`package.json`** with `pkg` configuration — `npm run build:exe` produces a single self-contained binary for Windows / macOS / Linux that embeds the JS sources + footprint list and runs without Node installed.
- **No impact on the browser extension**: Manifest V3 bundle is unchanged; `package.json` and `cli/` are ignored by Chrome.

## [4.0.0] - 2026-05-02

### 🎉 Major Release: Complete Rebranding and Feature Overhaul

#### Rebranding
- **Name Change**: Serpdigger → Paris Email Extractor
- Updated all branding, UI elements, and documentation
- New download filenames: `paris-email-extractor_DD-MM-YYYY_HH-MM.txt`
- Updated manifest version to 4.0.0

#### 🚀 New Features

##### Advanced Email Extraction Module (`email-extractor.js`)
- **RFC 5322 Compliant Regex**: Standards-compliant email pattern detection
- **Obfuscated Email Detection**: Automatically finds and converts patterns like:
  - `name [at] domain [dot] com`
  - `name (at) domain (dot) com`
  - `name AT domain DOT com`
  - `name <at> domain <dot> com`
  - `name {at} domain {dot} com`
- **Confidence Scoring**: Each email receives a 0-100 confidence score based on:
  - Source quality (standard, obfuscated, platform-specific)
  - Domain type (business vs ISP)
  - Format patterns (firstname.lastname scores higher)
  - Validation criteria
- **Platform Detection**: Automatically identifies LinkedIn, Apollo.io, ZoomInfo, and adjusts extraction strategy

##### LinkedIn, Apollo.io & ZoomInfo Support
- **LinkedIn Patterns**:
  - Profile contact sections (`site:linkedin.com/in/`)
  - Company pages (`site:linkedin.com/company/`)
  - Optimized for "contact info", "reach out", "email me" sections
- **Apollo.io Patterns**:
  - Data attribute extraction (`data-email`)
  - People directory scanning
  - Contact database patterns
- **ZoomInfo Patterns**:
  - Company profiles
  - People directories
  - Professional contact data
- **7 New Preset Footprints**:
  - ★ LinkedIn Profile Contacts (3 queries)
  - ★ LinkedIn Company Pages (2 queries)
  - ★ Apollo.io Profiles (2 queries)
  - ★ ZoomInfo Contacts (2 queries)
  - ★ Data Platforms Combined (2 queries)
  - ★ LinkedIn + Apollo Combined Search (3 queries)
  - ★ Professional Network Profiles (3 queries)

##### Enhanced Deep Scanning
- **Increased Timeout**: 15s → 20s for better success rate on slow pages
- **Better User-Agent**: Identifies as Paris Email Extractor
- **Multiple Extraction Sources**:
  1. `mailto:` links (case-insensitive)
  2. JSON-LD structured data (`application/ld+json`)
  3. Meta tags (name, property, content attributes)
  4. Data attributes (data-email, data-contact)
  5. Obfuscated patterns in HTML
  6. LinkedIn profile-specific sections
  7. Plain text after HTML stripping
- **HTML Entity Decoding**: Properly handles `&nbsp;`, `&quot;`, `&amp;`, `&lt;`, `&gt;`
- **Duplicate Prevention**: Tracks processed emails per page to avoid redundant additions

##### Improved Validation & Filtering
- **Expanded ISP Domain List**: 50+ personal email providers including:
  - Major webmail (Gmail, Yahoo, Outlook, Hotmail, etc.)
  - US ISPs (Comcast, AT&T, Verizon, Cox, etc.)
  - European providers (Web.de, Mail.ru, Yandex, etc.)
  - Asian providers (QQ, 163, Naver, Daum, etc.)
- **Enhanced Role-Based Detection**: 20+ role prefixes including:
  - `noreply`, `no-reply`, `donotreply`
  - `postmaster`, `webmaster`, `admin`
  - `support`, `info`, `contact`, `help`
  - `sales`, `marketing`, `newsletter`
- **Disposable Domain Detection**: 12+ temporary email services
  - Tempmail, Guerrillamail, 10minutemail, Mailinator, etc.
- **Test Domain Filtering**: Removes example.com, test.com, localhost, etc.
- **File Extension Detection**: Filters .png, .jpg, .css, .js, .pdf, etc.
- **Enhanced Junk Detection**:
  - Very short local parts (< 2 chars)
  - Invalid domain lengths (< 4 chars)
  - Missing dots in domain
  - Suspicious patterns

##### Email Normalization
- **Automatic Conversion**: Obfuscated emails are normalized to standard format
- **Case Standardization**: All emails lowercased for consistency
- **Whitespace Removal**: Strips extra spaces from lenient matches
- **Deduplication**: Global tracking prevents duplicate collection

#### 🔧 Enhancements

##### Content Script Improvements (`duckduckgo.js`)
- Integrated with new EmailExtractor module
- Platform-aware extraction (detects page type from URL)
- Graceful fallback to regex if module unavailable
- Better error handling

##### Background Script Enhancements (`runner.js`)
- Enhanced `_deepFetchPage` with 7 extraction methods
- Better HTTP headers for improved compatibility
- Improved error logging
- Smarter duplicate prevention per-page

##### UI/UX Updates
- Updated all references from Serpdigger to Paris Email Extractor
- New preset footprints visible in dropdown
- Clearer option descriptions
- Better account status indicators

#### 📚 Documentation

##### Comprehensive README Updates
- **New Features Section**: Detailed explanation of v4.0 capabilities
- **Advanced Features Guide**:
  - Email extraction enhancements
  - Platform-specific extraction
  - Deep scanning details
  - Intelligent filtering
  - Confidence scoring
- **Best Practices Section**:
  - 6 optimization strategies for maximum results
  - Query delay recommendations
  - Email type filtering tips
- **Troubleshooting Expansion**: 
  - 12 common issues with solutions
  - LinkedIn/Apollo/ZoomInfo specific guidance
  - MX validation tips
- **Limitations & Legal Notice**:
  - Rate limiting guidance
  - Platform access compliance
  - Data usage best practices
  - Regulatory compliance (GDPR, CAN-SPAM)

##### Project Structure Documentation
- Updated file tree with new modules
- Detailed descriptions of each component
- Enhanced vs original annotations

#### 🐛 Bug Fixes
- Fixed email regex to be case-insensitive where appropriate
- Improved handling of emails with spaces around @ symbol
- Better detection of emails in JSON-LD scripts
- Fixed meta tag extraction regex

#### 🔐 Security & Compliance
- Added legal notice about platform ToS
- GDPR/CCPA compliance guidance
- CAN-SPAM compliance recommendations
- Responsible use guidelines

#### ⚡ Performance
- Batched MX validation (5 domains at a time)
- Deduplication during extraction (not just at end)
- Reduced redundant regex passes
- Smarter URL collection (limit 30 per query)

---

## [3.1.0] - Previous Version

Legacy version (Serpdigger). See git history for changes prior to v4.0.0.

---

## Version History Summary

- **4.0.0**: Complete rebranding to Paris Email Extractor with major feature additions
- **3.1.0**: Previous stable version (Serpdigger)
