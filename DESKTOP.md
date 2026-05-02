# Running Paris Email Extractor on the Desktop

This document explains every supported way to run **Paris Email Extractor**
as a standalone program on your computer — without loading the browser
extension. The browser-extension build (Manifest V3) and the desktop
build share the **exact same** extraction module
(`content/email-extractor.js`), so results are identical between channels.

> **TL;DR** — install Node 18+, then either
>
> ```bash
> npm install -g .
> paris --help
> ```
>
> or build a single-file executable with
>
> ```bash
> npm run build:exe        # all targets
> ./dist/paris-linux       # Linux  (or paris-win.exe on Windows, paris-macos on macOS)
> ```

---

## 1 · Prerequisites

| Requirement | Why |
|---|---|
| **Node.js ≥ 18** | The CLI uses `globalThis.fetch`, `dns.promises`, top-level URL parsing, all 18+ APIs. |
| **Internet access** (for `search` / `footprint` / `mx`) | DuckDuckGo HTML endpoint + DNS lookups. |
| **Write access to `$HOME`** | Default history file lives in `~/.paris-email-extractor/history.json`. Override with `--history PATH` or `PARIS_HISTORY=…`. |
| `pkg` (optional, for building exe) | Auto-installed via `npm install` because it is listed under `devDependencies`. |

Check your Node version:

```bash
node --version    # must print v18.x or higher
```

---

## 2 · Install the CLI globally (`paris` command)

From a checkout of this repository:

```bash
npm install                # installs pkg as a devDep (only needed for build:exe)
npm install -g .           # registers the `paris` bin globally
paris --version            # → "Paris Email Extractor CLI 4.3.0"
paris --help
```

After this, `paris` is on your `PATH` everywhere. To uninstall:

```bash
npm uninstall -g paris-email-extractor
```

If you do **not** want a global install you can run the CLI directly:

```bash
node cli/paris.js --help
```

---

## 3 · Build a single-file executable (no Node required to run)

The repository ships a [`pkg`](https://www.npmjs.com/package/pkg)
configuration in `package.json`. You only need Node + `npm install` to
**build**; the resulting binary is fully self-contained and can be copied
to a machine that has no Node installed.

| Target | Command | Output |
|---|---|---|
| All three platforms | `npm run build:exe` | `dist/paris-{win,macos,linux}` |
| Windows only | `npm run build:exe:win` | `dist/paris-win.exe` |
| macOS only (Intel + Apple Silicon) | `npm run build:exe:mac` | `dist/paris-macos-x64`, `dist/paris-macos-arm64` |
| Linux only | `npm run build:exe:linux` | `dist/paris-linux` |

Sample run on each OS:

```powershell
:: Windows (PowerShell or cmd)
.\dist\paris-win.exe extract https://example.com --follow-contact
```

```bash
# macOS — first run on Apple Silicon may need:
xattr -d com.apple.quarantine ./dist/paris-macos-arm64
./dist/paris-macos-arm64 search "site:linkedin.com/in/ \"@acme.com\"" --country GB --mx
```

```bash
# Linux
chmod +x ./dist/paris-linux
./dist/paris-linux footprint "Lead Platform: Facebook Pages" --after 2025-01-01
```

> **Note:** the packaged binary embeds `content/email-extractor.js` and
> `background/api.js` (for the built-in footprints) at build time, so it
> stays in sync with the extension. Re-run `npm run build:exe` whenever
> you update those files.

---

## 4 · Quick-reference of every command

| Command | Purpose |
|---|---|
| `paris extract <url\|file>` | Pull emails from a single page or local HTML/text file |
| `paris search "<query>"` | Run a DuckDuckGo search and deep-scan every result |
| `paris footprint "<match>"` | Run any of the 1062 built-in footprints by name substring |
| `paris list-footprints [filter]` | List built-in footprints (optionally filter by substring) |
| `paris permute <first> <last> <domain>` | Generate corporate email permutations |
| `paris mx <email...>` | MX-validate one or more email addresses |
| `paris history [stats\|list\|export FILE\|clear --yes]` | Manage the persistent extraction history |
| `paris --version` / `paris --help` | Print version / usage |

### Options that apply to `extract`, `search`, and `footprint`

| Flag | Meaning |
|---|---|
| `--out FILE` | Write to a file instead of stdout |
| `--format json\|csv\|txt` | Output format (default `txt`) |
| `--max-pages N` | Search-engine pages to crawl (default 2) |
| `--concurrency N` | Parallel fetch concurrency (default 6) |
| `--include-isp` | Keep ISP/webmail addresses in results |
| `--include-roles` | Keep role-based addresses (`info@`, `sales@` …) |
| `--min-confidence N` | Drop emails below this confidence (default 30) |
| `--domain D` | Restrict results to a specific domain |
| `--country CC` | Restrict to a country's ccTLD (ISO 3166-1 alpha-2 — 70 codes) |
| `--follow-contact` | **Deep-DB:** also fetch each result's `/contact`, `/about`, `/team`, `/people`, `/staff`, `/leadership`, `/management`, `/directory`, `/employees`, `/impressum` |
| `--mx` | MX-validate every result before output |

### History / date options (skip duplicates across runs)

| Flag | Meaning |
|---|---|
| (default) | **Skip every email already present in the history** |
| `--no-skip-seen` | Disable the skip-seen filter for this run |
| `--since YYYY-MM-DD` | Only re-emit emails first seen on/after this date |
| `--until YYYY-MM-DD` | Only re-emit emails first seen on/before this date |
| `--history PATH` | Override the history-file location |
| `--after YYYY-MM-DD` | Inject Google `after:` operator into the query |
| `--before YYYY-MM-DD` | Inject Google `before:` operator into the query |
| `PARIS_HISTORY=…` (env var) | Same effect as `--history PATH` for every command |

The history file is a plain JSON document of the form

```jsonc
{
  "version": 1,
  "updatedAt": "2026-05-02T16:40:00.000Z",
  "emails": {
    "ceo@example.com": {
      "firstSeen": "2026-04-15T10:21:00.000Z",
      "lastSeen":  "2026-05-02T16:40:00.000Z",
      "sourceUrl": "https://example.com/team",
      "footprint": "Lead Platform: Facebook Pages",
      "command":   "footprint",
      "source":    "mailto",
      "confidence": 95
    }
  }
}
```

so it round-trips cleanly between desktop runs. Default location:

| OS | Path |
|---|---|
| Linux / macOS | `~/.paris-email-extractor/history.json` |
| Windows | `%USERPROFILE%\.paris-email-extractor\history.json` |

---

## 5 · Recipes

```bash
# 1. One-off scrape of a single page (writes to leads.csv, follows /contact, /about, /team)
paris extract https://example.com --follow-contact --format csv --out leads.csv

# 2. Deep-scan a country-restricted footprint, MX-validate and export JSON
paris footprint "Apollo.io" --country DE --max-pages 3 --mx --format json --out de-leads.json

# 3. Pull Facebook-page emails published since 1 Jan 2025, write CSV
paris footprint "Lead Platform: Facebook Pages" --after 2025-01-01 --format csv --out fb-2025.csv

# 4. Re-run the same footprint daily — only NEW emails will appear in today's file
paris footprint "Lead Platform: All Social & Lead-Gen Platforms" --out leads-$(date +%F).csv --format csv

# 5. Generate every plausible permutation of "Jane Doe @ acme.com" and keep only MX-valid ones
paris permute Jane Doe acme.com --mx --format json --out jane-valid.json

# 6. MX-check a list of emails piped from a file
xargs -a candidates.txt paris mx --format csv > mx-results.csv

# 7. Inspect / export / wipe the history
paris history stats
paris history list --format csv --out seen.csv
paris history export backup-$(date +%F).json
paris history clear --yes

# 8. Use a separate history file per project (great for parallel pipelines)
PARIS_HISTORY=./project-a.json paris footprint "RocketReach" --max-pages 5
PARIS_HISTORY=./project-b.json paris footprint "RocketReach" --max-pages 5
```

---

## 6 · Browser extension (unchanged)

The desktop CLI is **completely independent** of the Chrome / Edge
extension. The extension is loaded the same way as before:

1. `chrome://extensions/` → enable *Developer mode*
2. **Load unpacked** → pick this repository's root folder
3. The popup gains a **"Skip emails seen in previous runs"** checkbox
   (default off). When on, the runner reads
   `chrome.storage.local.seenEmails` at the start of every run and drops
   any address already present, mirroring the CLI behaviour. The
   **Clear seen-history** button next to it wipes that store.

The extension and the CLI maintain **separate** histories — the
extension's lives in `chrome.storage.local.seenEmails`, the CLI's in
`~/.paris-email-extractor/history.json`. Use `paris history export` to
back up the CLI history, and the extension's *Clear seen-history*
button to wipe the popup history.

---

## 7 · Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot find module '../content/email-extractor.js'` | Run `paris` from a checkout, or rebuild the exe — the embedded module is missing. |
| `pkg` build fails on macOS with "code signature" error | `xattr -d com.apple.quarantine ./dist/paris-macos-*` then re-run. |
| `Found 0 email(s)` on every run | History is filtering them. Either pass `--no-skip-seen`, run `paris history clear --yes`, or pick a fresh `--history PATH`. |
| `Warning: history file unreadable` | The JSON got truncated by a `kill -9`. Either delete it or run `paris history clear --yes`. |
| `EACCES` writing the history | Set `PARIS_HISTORY=/writable/path/history.json` or pass `--history`. |
| Search returns 0 URLs | DuckDuckGo throttled you — wait 30 s, lower `--concurrency`, or add `--max-pages 1`. |
