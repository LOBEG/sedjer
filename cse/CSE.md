# Paris Lead-Gen Programmable Search Engine

This folder ships a **ready-to-import Google Programmable Search Engine
(PSE / “CSE”) bundle** tuned for Paris Email Extractor. Once you create
the engine and paste your `cx` parameter back into the CLI, every
`paris search` and `paris footprint` query is routed through Google’s
own index instead of the DuckDuckGo HTML scraper — typically returning
**5–10× more lead-gen pages per query** with a much better signal-to-noise
ratio.

## What’s in the bundle

| File | Purpose |
|---|---|
| **`paris-cse-annotations.xml`** | The annotation file you import into Programmable Search Engine. Generated from all **1062 built-in footprints** in `background/api.js`. Boosts ~70 lead-gen domains (LinkedIn, Apollo, ZoomInfo, RocketReach, Crunchbase, Wellfound, GitHub, Substack, …) and excludes 23 well-known noise sites (lyrics farms, TripAdvisor, Pinterest, …). |
| **`cse-config.json`** | The same data in machine-readable form. Useful if you want to inspect or remix the lists. |
| **`build-cse.js`** | Regenerator. Re-run with `node cse/build-cse.js` whenever the footprints change. |

## 60-second setup

1. Open <https://programmablesearchengine.google.com/controlpanel/all> and
   sign in with the Google account you want to use.
2. Click **Add** → name the engine **“Paris Lead-Gen Engine”** → toggle
   **“Search the entire web”** → click **Create**.
3. Open the new engine, click **Setup → Advanced**, and choose
   **“Import from XML”**.
4. Upload `cse/paris-cse-annotations.xml` from this repo. Click **Save**.
5. From **Setup → Basics**, copy the **Search engine ID** — this is your
   `cx` parameter (looks like `0123456789abcdef0:abcdefghijk`).

That’s it — **no API key required**. The CLI scrapes the public CSE
results page in the same way it scrapes DDG.

## Plug it into the program

You have three equivalent ways to tell Paris to use your CSE:

### 1. Per-command flag

```bash
paris search '"@example.com"' --cse 0123456789abcdef0:abcdefghijk
paris footprint Apollo --cse 0123456789abcdef0:abcdefghijk --desktop
```

### 2. Environment variable (recommended for daily use)

```bash
# Bash / zsh
export PARIS_CSE_CX="0123456789abcdef0:abcdefghijk"

# Windows PowerShell
$env:PARIS_CSE_CX = "0123456789abcdef0:abcdefghijk"

# Windows cmd.exe
set PARIS_CSE_CX=0123456789abcdef0:abcdefghijk
```

Once it’s set, `paris search` and `paris footprint` automatically use
your engine — no flag needed.

### 3. Interactive menu

Launch the menu (`paris` with no args, or double-click the `.exe`),
choose **8) Settings & defaults**, then **CSE engine ID (cx)**. The
value is saved for the rest of the session and gets used by every
search and footprint action.

## What changes when CSE is enabled

| | DuckDuckGo (default) | Programmable Search Engine |
|---|---|---|
| Auth required | none | none (public results page) |
| Daily rate limit | DDG’s anti-scrape floods after ~150 queries | Google’s public CSE page is much more lenient |
| Results per page | 30 | 10 (so you may want `--max-pages 5–10`) |
| Site boost / exclude | n/a | full annotation set (~90 sites) |
| Deep-scan integration | yes | yes (same downstream pipeline) |

## Refreshing the bundle

If you edit `background/api.js` (add/remove footprints) just run:

```bash
node cse/build-cse.js
```

That regenerates `paris-cse-annotations.xml` and `cse-config.json` in
place. Re-import the XML in Programmable Search Engine to update the
live engine.

## How it works under the hood

The CLI’s `cseSearchUrls()` helper hits
`https://cse.google.com/cse?cx=<cx>&q=<urlencoded query>&start=<n>`
and parses the result anchors out of the rendered HTML. It then calls
the **same** `extractFromHtml()` pipeline used by the DDG path, so all
the existing flags (`--country`, `--follow-contact`, `--mx`,
`--include-isp`, `--strict`, `--desktop`, …) still work.

If a CSE call fails (engine deleted, network glitch, Google rate-limit)
the program automatically falls back to DDG so you never end up with no
results.
