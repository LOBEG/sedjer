# Changelog

All notable changes to Paris Email Extractor will be documented in this file.

## [5.1.0] - 2026-05-03

### 🌐 Browser-extension parity, round 4 — strict / date / live-DOM / name CSV / unlimited

Closes every remaining "Section 1a" gap, ships the rest of "Section 1b" (live-DOM extraction), and lifts the historical caps on extraction depth so deep-scan can run "unlimited".

#### `--strict` checkbox (CLI parity, trivial)
- `popup/popup.html` — new `#strictCheckbox` directly under `#minConfidenceInput`. When ticked, snaps Min confidence to **30** and disables the numeric input; unchecking restores the previous manual value (persisted in `chrome.storage.local._preStrictMinConfidence`). Mirrors `cli/paris.js`'s `--strict`.
- `popup/query.js` — `storeStrict` / `restoreStrict` / `applyStrictMode(on, persistMinConf)` helpers; `applyStrictMode` is invoked both at restore (UI sync only, no storage write) and on click (full storage + `state:setMinConfidence` push so an in-flight run picks the change up immediately).

#### `after:` / `before:` query operators (CLI `--after` / `--before` parity)
- `popup/popup.html` — new `#afterDateInput` / `#beforeDateInput` (`<input type="date">`) inside the existing left settings column.
- `popup/query.js` — `storeAfterDate` / `storeBeforeDate` (with strict ISO-day validation) wired to the inputs. `getQueries()` injects `after:YYYY-MM-DD` / `before:YYYY-MM-DD` operators **after** country-TLD and industry prepending so the resulting query reads naturally and matches the ordering in `cli/paris.js#applyDateRangeToQuery`.
- Both empty ⇒ no operator emitted (zero behavioural change for existing users).

#### `--since` / `--until` post-extraction history filter (CLI parity)
- `popup/popup.html` — new `#sinceDateInput` / `#untilDateInput`. Compared against the persistent seen-history's `firstSeen` day per email.
- `popup/query.js` — `storeSinceDate` / `storeUntilDate` plus runtime `state:setHistorySince` / `state:setHistoryUntil` events.
- `background/communication.js` — new listeners that validate `YYYY-MM-DD` and update `serpdigger.runner.current.historySince/Until` mid-run.
- `background/runner.js` — `_shouldDropByHistoryWindow(email)` is consulted in **both** the SERP `runner:update` path AND the deep-fetch path. Drops only when the email is already in seen-history AND its `firstSeen` day is OUT of the `[since, until]` window (brand-new emails are never date-filtered). `seenEmails` is now always loaded at run start (regardless of `skipSeen`) so the date filter has data to compare against.

#### Name-association in CSV download (CLI v4.6 parity, schema migration)
- **Schema change**: `serpdigger.runner.current.emailsFound` is now an `Array<{email, name?, confidence?}>` (was `string[]`). All call sites updated:
  - `background/runner.js` — new helpers `_toEmailRecord(item)`, `_emailKey(rec)`, `_emailsFoundContains(arr, email)`, `_emailsFoundAsStrings(arr)` normalize legacy strings on the fly. `runner:update` listener, deep-fetch push, MX validation (`serpdigger.validateEmails` extracts strings for DNS lookups but the rich array is preserved for the download path), and seen-history persistence (`_onRunnerFinish`) all read records via the helpers.
  - `content/duckduckgo.js` — new `Runner.prototype._collectRecords(records)` collector that preserves `name`/`confidence`. The CSE and generic SERP branches now prefer `EmailExtractor.extractEmailsWithContext(rawHtml, opts)` (which attaches a `name` via heading-proximity heuristic), falling back to `extractFromHtml` then plain text-regex. The legacy string-based `_collectEmails` path is preserved for the regex-fallback branch.
  - `background/runner.js` deep-fetch — also prefers `extractEmailsWithContext` when available; merges structural results into a rich `{email, name, confidence}` map keyed by lowercased email (highest-confidence wins; missing names are filled in from later passes).
- `serpdigger.download(filterMode)` now switches to **CSV format** (`email,name,confidence` header, double-quoted, RFC-4180 escaping) and a `.csv` extension whenever **any** record carries a non-empty name; otherwise emits the legacy `.txt` of email lines. CSV uses a `Blob`/`URL.createObjectURL` flow for proper UTF-8; the legacy txt path keeps the existing base64 data URL.

#### Live-DOM extraction (Section 1b power feature)
- `content/duckduckgo.js` — new `_collectLiveDomExtras(root)` is called alongside `_collectOuterHtmlWithShadows` on every SERP container:
  - **`getComputedStyle(el, '::before').content` / `::after`** reader: walks every element under `root`, reads the runtime pseudo-element `content` value, unquotes surrounding `'…'`/`"…"`, decodes CSS hex escapes (`\\hh`), and appends any string containing `@` to the rawHtml fed into the extractor. Catches emails delivered via CSS pseudo-element `content:` declarations whose runtime values differ from the static stylesheet rules the existing `extractFromHtml` CSS pass already scrapes.
  - **Same-origin iframe walker**: `iframe.contentDocument.body.outerHTML` for every accessible frame (one level of nested iframes too). Cross-origin frames throw on `contentDocument` access and are silently skipped — guaranteed safe per the same-origin policy.
  - 20,000-element visit cap protects against pathological pages.

#### Run-history tab (popup UX)
- `popup/popup.html` — new collapsible **Run history** panel (timestamp, footprint, email count, top-3 result domains) positioned between MX results and the bottom settings row. Click the heading to expand/collapse; "Clear history" wipes the list.
- `background/runner.js` — new `_recordRunHistory(found)` invoked at the tail of `_onRunnerFinish`. Prepends a compact record `{ts, footprint, count, topDomains[]}` to `chrome.storage.local.runHistory`, capped at 50 most-recent entries.
- `popup/query.js` — `refreshRunHistory()` renders the table; auto-refreshes when `popup:complete` arrives so the user sees their just-finished run immediately.

#### Unlimited extraction (caps lifted)
- `content/duckduckgo.js` — `Pages per query (1-100)` becomes `Pages per query (0 = unlimited)`; the page-pagination loop now treats any non-positive `maxPages` as **infinite** (continues until the search engine itself stops returning a "next" link). Removed the historical `resultUrls.slice(0, 30)` cap on deep-scan fan-out — the result list is now bounded only by what the SERP page renders, while the queue itself remains throttled by `deepScanConcurrency` (default 6, `0 = unlimited`).
- `_collectOuterHtmlWithShadows` descent cap: 5,000 → 50,000 nodes.
- `popup/popup.html` — `#maxPagesInput` `min` lowered to `0`, `max` raised to `9999`.
- `popup/query.js` `#maxPagesInput` handler accepts 0 (= unlimited) and clamps only at the new 9999 ceiling.

#### Defaults preserve current behaviour
| Setting | Default | Storage key |
|---|---|---|
| Strict mode | OFF | `strictMode` |
| After date | empty (no operator) | `queryAfterDate` |
| Before date | empty (no operator) | `queryBeforeDate` |
| Since date | empty (no filter) | `historySinceDate` |
| Until date | empty (no filter) | `historyUntilDate` |
| Pages per query | 10 (changed from "1–100" to "0 = unlimited") | `maxPagesPerQuery` |
| Run-history cap | 50 entries | `runHistory` |

## [5.0.0] - 2026-05-03

### 🌐 Browser-extension parity, round 3 — industry, follow-contact, footprint-aware filename, shadow DOM

Closes the next batch of CLI → extension parity gaps and lands the first new "section 1b" power feature (shadow-DOM traversal).

#### Industry targeting (CLI v4.6 `--industry` parity)
- `popup/popup.html` — new `#industry-select` dropdown placed above the existing Country row. Lists all 19 verticals from `cli/paris.js#INDUSTRY_KEYWORDS` (saas, fintech, healthcare, biotech, real-estate, education, manufacturing, marketing, legal, ecommerce, logistics, energy, hospitality, construction, automotive, media, gaming, nonprofit, consulting), plus an "— Any industry —" sentinel default.
- `popup/query.js` — copied `INDUSTRY_KEYWORDS` map verbatim into `POPUP_INDUSTRY_KEYWORDS` (must stay in sync with CLI; same convention as `POPUP_COUNTRY_TLDS`). New `popupApplyIndustryFilter(query, name)` mirrors `applyIndustryFilter()`: prepends `(kw1 OR kw2 OR …) ` to the line, with the same "skip if industry name already present" guard. New `storeIndustry`/`restoreIndustry` against `chrome.storage.local.industry`.
- Application order in `getQueries()`: country-TLD prepending first (so the country `site:` filter binds to the original footprint), then industry-keyword prepending — exactly mirroring CLI ordering for natural reading and identical search-engine behaviour.

#### `--follow-contact` deep DB scan (CLI v4.2 parity)
- `popup/popup.html` — new `#followContactCheckbox` next to "Deep Scan pages" / "Auto MX validate".
- `popup/query.js` — `storeFollowContact` / `restoreFollowContact` against `chrome.storage.local.followContact`; `state:setFollowContact` runtime event.
- `background/runner.js` — copied `CONTACT_SUBPATHS` array verbatim from CLI (14 paths: `/contact[-_us]`, `/about[-_us]`, `/team`, `/our-team`, `/people`, `/staff`, `/leadership`, `/management`, `/directory`, `/employees`, `/impressum`). New `_maybeQueueContactSubpaths(url, …)` invoked at the end of every successful `_deepFetchPage`. Per-run host-set (`_followContactSeenHosts`, reset in `serpdigger.run`) prevents N×N fan-out and infinite recursion. The fan-out is suppressed when the URL itself is already a contact subpath. Reuses the existing concurrency limiter (`deepScanConcurrency`) and skip-seen / dedup machinery.
- `background/communication.js` — new `state:setFollowContact` listener.

#### Footprint-aware download filename (CLI v4.5 parity)
- `popup/query.js#getQueries()` now resolves a sanitised `footprintLabel` from the first non-empty footprint line (lowercased, alnum + dash + underscore only, capped at 32 chars; multi-line footprints tag the run as `custom`) and passes it back inside the `state:start` payload.
- `background/runner.js#serpdigger.run` persists the label on `runner.current.footprintLabel`; `serpdigger.download()` builds `paris-<safe-label>_<ts>[suffix].txt` when present and falls back to the legacy `paris-email-extractor_<date>_<time>[suffix].txt` filename when empty (so any existing user expectations / scripts keep working).

#### New: Shadow-DOM traversal (section 1b power feature)
- `content/duckduckgo.js` — new `_collectOuterHtmlWithShadows(rootEl)` helper concatenates the host's `outerHTML` with the `innerHTML` of every reachable open shadow root (recursively). Both SERP-card branches (Google CSE / Google / Bing / generic) now use it, enriching the `rawHtml` fed to `EmailExtractor.extractFromHtml`. Closed shadow roots remain inaccessible by design. A 5,000-node descent cap protects against pathological pages, and any error in shadow traversal silently degrades to plain `outerHTML` — guaranteeing zero regression on normal SERP pages.

#### Defaults preserve current behaviour
| Setting | Default | Storage key |
|---|---|---|
| Industry | empty | `industry` |
| Follow contact | OFF | `followContact` |
| Footprint label | empty (legacy filename) | derived per run |

Users who don't touch the new controls see exactly the same extension behaviour as v4.9.

## [4.9.0] - 2026-05-03

### 🌐 Browser-extension parity, round 2 — filter-options exposure

The CLI exposes four filter knobs (`--min-confidence`, `--include-roles`, `--exclude-isp`, `--rfc-strict`) that drive `EmailExtractor.filterEmails()` and `validateEmail()`. The extension hardcoded all four in two places:
- `content/duckduckgo.js` (SERP path, lines ~217 & ~261): `{ minConfidence: 30, excludeRoles: true }`
- `background/runner.js#_deepFetchPage` (lines ~412): `{ minConfidence: 30, excludeRoles: true }` plus a pattern-aware `excludeISP: true`

v4.9 surfaces all four as popup controls so the extension matches CLI flexibility.

#### New popup controls (in the deep-scan settings column)
- `#minConfidenceInput` — number 0–100, default `30`. CLI: `--min-confidence`.
- `#excludeRolesCheckbox` — default checked. CLI: `--include-roles` to negate.
- `#excludeIspCheckbox` — default checked (intentionally opposite of CLI default to preserve current extension UX). CLI: `--exclude-isp`.
- `#rfcStrictCheckbox` — default unchecked. CLI: `--rfc-strict`. Threaded into `validateEmail()` via `extractEmails`/`extractFromHtml` `options.rfcStrict`, which un-rejects rare RFC 5322 specials in the local part (`!#$%&'*/=?^`{|}~`).

#### Wiring
- **`popup/query.js`**: `storeMinConfidence` / `storeExcludeRoles` / `storeExcludeIsp` / `storeRfcStrict` writing to `chrome.storage.local.{minConfidence,excludeRoles,excludeIsp,rfcStrict}`. Matching `restore*` functions pre-fill the inputs at popup open with safe defaults.
- **`background/runner.js`**: 4 fields added to `serpdigger.runner.current` defaults; 4 `chrome.storage.local.get` blocks load them at SW init mirroring the existing pattern. `_deepFetchPage` now reads `serpdigger.runner.current` instead of using hardcoded values, with the existing pattern-domain rule preserved (it still wins over `excludeIsp` when a domain pattern is present). Filter opts are also pushed into the content-script `eventName: 'run'` `eventData.filterOpts` payload so SERP extraction honours them.
- **`background/communication.js`**: 4 new `state:setMinConfidence` / `state:setExcludeRoles` / `state:setExcludeIsp` / `state:setRfcStrict` listeners propagate popup toggles to the SW so an in-progress run picks up the new values immediately, exactly like `state:setRemoveDuplicates` / `state:setDeepScan` / `state:setMxValidation`.
- **`content/duckduckgo.js`**: SERP `extract()` reads `runner.options.filterOpts` and uses it as the basis of both `serpFilterOpts` (for `filterEmails`) and `extractorOpts` (for `extractEmails`/`extractFromHtml` so `rfcStrict` reaches `validateEmail`). Defaults preserve legacy hardcoded behaviour when the popup hasn't opted in.

### Compatibility
- Default values match what the extension already did (min-conf 30, exclude roles, exclude ISP, loose RFC). Users who never touch the new controls see no behaviour change.
- Pattern-aware ISP rule preserved: when a footprint specifies a domain (e.g. `@acme.com`) the deep-scan path restricts to that domain regardless of the `excludeIsp` toggle — the domain restriction is strictly stronger.
- CLI behaviour unchanged.

### Validation
- Syntax: `background/runner.js`, `background/communication.js`, `popup/query.js`, `popup/popup.html`, `content/duckduckgo.js` all pass.
- Filter-options smoke (mock fixture): default extension settings drop `info@gmail.com` (role + ISP) and `bob.smith!#=@acme.com` (validateEmail loose), keep `jane@acme.com`. With `rfcStrict:true`, `bob.smith!#=@acme.com` survives. With `excludeRoles:false, excludeISP:true`, `info@gmail.com` is still dropped by the ISP rule. All transitions correct.
- v4.7 regression: end-to-end fixture (Cloudflare cfemail + CSS split + RTL bdo + split-span + script + standard) still produces the expected 6 emails.
- Version bumped to 4.9.0 (`package.json`, `manifest.json`).

## [4.8.0] - 2026-05-03

### 🌐 Browser-extension parity, round 1

The CLI raced ahead through v4.5–v4.7 while the browser extension lagged behind on two fronts. v4.8 closes the most important gaps.

#### Audit fix — DDG content-script wiring (v4.7 structural extractors)
- **Before**: `content/duckduckgo.js` extracted SERP results via `$el.text()` + `EmailExtractor.extractEmails(text)`, which loses HTML structure. The five v4.7 structural extractors (Cloudflare cfemail, CSS pseudo-elements, RTL reversal, fragment reconstruction, `<script>` bodies) only ran in the service-worker deep-fetch path — never on the SERP page itself.
- **Now**: when `window.EmailExtractor.extractFromHtml` is available, the content script passes `el.outerHTML` to it, so SERP cards get the same five-method structural pass as deep-fetched pages. Falls back to `.text()` + `extractEmails()` cleanly when an older `EmailExtractor` build is loaded. Both the CSE branch (`.gsc-result`) and the Google/Bing/generic branch (`#search .g`, `#b_results .b_algo`, `body`) are updated.

#### CSE Programmable Search Engine path — `cx` ID input
- **CLI** (since v4.6) accepts a CSE `cx` ID via `--cse <cx>`, `PARIS_CSE_CX`, or `INTERACTIVE_SETTINGS.cseCx`, then builds `https://cse.google.com/cse?cx=<cx>&q=<query>&ia=web&start=…` itself.
- **Extension** previously only had a single `#cse-address-input` field that demanded the full pre-built CSE URL (e.g. `https://cse.google.com/cse?cx=ABC...`). Users with only a `cx` ID couldn't paste it.
- **Now**: a new `#cse-cx-input` field sits at the top of the existing `#cse-row` and is labelled "CSE cx ID (preferred)". The legacy URL field stays as a fallback labelled "CSE Main Address (fallback)".
  - `popup/query.js`: new `storeCSECx(str)` writes to `chrome.storage.local.cseCx`; new `restoreCSECxFromStorage()` rehydrates the input on popup open; the input is wired with the same `change keyup` handler as the URL field.
  - `background/runner.js#_nextRunner`: when `searchEngine === 'cse'`, reads both `cse` and `cseCx`. If a non-empty `cseCx` is set, builds the URL from cx using the **exact same template** as `cseSearchUrls()` in `cli/paris.js`. Falls back to the existing URL-field path when `cseCx` is empty — no breaking change for users who already pasted a full URL.
  - The new field is `encodeURIComponent`'d when injected into the URL (cx IDs contain `:`).

### Compatibility
- Existing users who already configured the CSE URL field see no change. The cx field is opt-in.
- Browser-extension Manifest V3, content scripts, and service worker continue to load `content/email-extractor.js` unchanged. The new content-script wiring uses `typeof window.EmailExtractor.extractFromHtml === 'function'` so older builds still work.
- CLI behaviour unchanged.

### Validation
- Syntax: `background/runner.js`, `popup/query.js`, `content/duckduckgo.js`, `popup/popup.html` all pass.
- URL builder smoke (mock): `cx`-only, `cx` wins over URL when both set, URL fallback, and neither-set (no-op) all behave correctly.
- v4.7 regression: end-to-end fixture (Cloudflare cfemail + CSS split + RTL bdo + split-span + script + standard) still produces the expected 6 emails with correct source labels.
- Version bumped to 4.8.0 (`package.json`, `manifest.json`).

## [4.7.0] - 2026-05-03

### 🔍 Five new structural extraction methods

These five passes operate on **raw HTML** (no live DOM required) so they run
identically in the content scripts, the service-worker deep-scan, and the
standalone CLI. They surface emails the regex-on-stripped-text path cannot
see — typically a 10–25 % recall lift on small-business sites that proxy
through Cloudflare or use any of the common scraper-defeat tricks.

#### 1. Cloudflare email-obfuscation decoder
- Cloudflare auto-rewrites every `mailto:` on millions of small-business sites into XOR-encoded blobs:
  `<a class="__cf_email__" data-cfemail="HEXHEX...">[email&nbsp;protected]</a>` and `/cdn-cgi/l/email-protection#HEX` href fragments.
- New `EmailExtractor._decodeCfEmail(hex)` and `_extractCfEmails(html)` decode them: byte 0 of the hex string is the XOR key; each remaining byte is XOR'd against the key to recover ASCII. Source label `cloudflare`, confidence boost +5 (very high signal — a `mailto:` was demonstrably present pre-rewrite).

#### 2. CSS `::before` / `::after` content extraction
- Sites hide pieces of an email inside CSS pseudo-element content, e.g. `.email::after { content: "@acme.com" }`.
- New `_extractCssEmails(html)` scans every `<style>…</style>` block plus inline `style="content:…"` attributes for `content:"…"` strings. Single-pass: any string already containing `@` is emitted directly. Pair-pass: when the first content string has NO `@` and the second STARTS with `@`, the concatenation is emitted (catches the `::before {content:"jane"}; ::after {content:"@acme.com"}` split pattern). Source label `css`.

#### 3. RTL / bidi-override reversal
- `<bdo dir="rtl">moc.emca@enaj</bdo>` and `<span style="direction:rtl">…</span>` display as `jane@acme.com` in the browser but defeat regex.
- New `_extractRtlEmails(html)` finds all RTL-tagged elements, captures their inner text, reverses it (Unicode-safe via `Array.from`), and runs the email regex on the reversed string. Also handles free-floating Unicode bidi-control characters (U+202E RIGHT-TO-LEFT OVERRIDE, U+202D LRO, U+202B RLE, U+202A LRE, U+2066–U+2069 isolates) by stripping them and reversing the affected substring. Source label `rtl`.

#### 4. Split-span / fragment reconstruction
- The previous tag-stripper replaced **every** tag with a space, so `<span>jane</span><span>@</span><span>acme.com</span>` became `jane @ acme.com` and was lost.
- New `_htmlToTextPreservingInline(html)` replaces **inline** elements (`span`, `b`, `i`, `em`, `strong`, `small`, `sup`, `sub`, `mark`, `wbr`, `q`, `code`, `tt`, `font`, `u`, `s`, `strike`, `bdo`, `bdi`, `time`, `cite`, `abbr`, `dfn`, `ins`, `del`, `kbd`, `samp`, `var`, `ruby`, `rt`, `rp`, `a`) with the **empty string**, so split-span emails reconstruct cleanly. Block-level tags (`p`, `div`, `br`, `h1`–`h6`, `li`, …) still produce a space so unrelated paragraphs aren't glued together.

#### 5. JS-encoded emails in `<script>` bodies
- Emails are commonly hidden in JavaScript: as plain string literals, as `String.fromCharCode([…])` arrays, as `atob("base64")` calls, or as concatenated literals (`"jane" + "@" + "acme.com"`).
- New `_extractScriptEmails(html)` walks every `<script>` body (skipping JSON-LD and external-src scripts) and runs four sub-passes:
  - **5a String literals** — `"…"` and `'…'` containing `@` and a TLD-shaped tail.
  - **5b `String.fromCharCode([…])`** — numeric arrays decoded to text.
  - **5c `atob("base64")`** — base64 strings decoded if they contain `@` (uses native `atob` in the browser/SW, falls back to `Buffer` in Node CLI).
  - **5d Concatenated literals** — `"a" + "b" + "c"` chains whose joined value contains `@`.
  Source label `script`, confidence -5 (slightly lower because `<script>` blocks are high-noise: ad-tag templates, tracking blobs, …).

### Wiring
- New shared method **`EmailExtractor.extractFromHtml(html, options)`** runs the five passes above in order, then runs the standard text extraction over the inline-preserving stripped text, and returns merged dedup'd records (highest-confidence wins on conflict).
- `EmailExtractor.extractEmailsWithContext(html)` (v4.6) now calls `extractFromHtml` internally so the `name` association still works on top of all five new sources.
- The CLI's existing `extractFromHtml(html, url, opts)` — which calls `extractEmailsWithContext` whenever the input contains `<` — picks up the new pipeline transparently.
- The service-worker's `_deepFetchPage` runs the structural extractors on the original HTML and merges the results with its existing preserved-pipeline output, so deep-scan jobs get the full 5-method coverage too.

### Validation
- Per-method unit fixtures verified: cfemail (`data-cfemail="…"` and `/cdn-cgi/l/email-protection#…`), CSS (single content string, before+after split), RTL (`<bdo dir="rtl">`, `direction:rtl` style, free-floating U+202E), split-span (`<span>j</span><span>@</span><span>x.com</span>`), and all four script sub-passes (literal, charCode, atob, concat).
- v4.6 regression: gmail still kept by default; symbol-noise still rejected; name association still attaches Jane Doe to `jane@acme.io`; CSV `name` column still emitted.
- CodeQL clean.

### Compatibility
- Browser extension and Manifest V3: unchanged. The new methods are added to the shared `EmailExtractor` module which is already loaded by both the content scripts and the service worker.
- All existing CLI flags continue to work. No new flags required — the structural extractors are always on (they have an excellent precision/recall trade-off).

## [4.6.0] - 2026-05-03

### 🐛 Bug fixes & smarter extraction

#### Bug: Gmail (and other ISP/webmail) addresses were being silently dropped
- The CLI's default filter previously hard-coded `excludeISP: true`, so `john@gmail.com`, `jane@yahoo.com`, `dev@outlook.com`, etc. never reached the user's CSV/JSON output.
- Default flipped: **personal/ISP addresses are now KEPT by default.** Pass `--exclude-isp` to opt back into the old filtering. The legacy `--include-isp` flag is preserved as a no-op alias for back-compat with existing scripts.

#### Bug: Local parts with rare RFC 5322 specials produced "noise" emails
- The standard email regex matched RFC-compliant but unrealistic local parts like `john!#%&doe@acme.com`, which were almost always regex over-matches on HTML junk (button text, JSON fragments, ad-tracking blobs glued together by tag stripping).
- New "clean local-part" check in `EmailExtractor.validateEmail()` rejects emails whose ASCII local part contains any of `!#$%&'*/=?^\`{|}~`. Allowed: alphanumerics, `.`, `_`, `+`, `-`. Pass `--rfc-strict` (or `validateEmail(email, {rfcStrict:true})`) to opt back into the loose RFC behaviour. The check is skipped for non-ASCII local parts, so RFC 6531 / IDN addresses are unaffected.

#### Industry-targeted search
- New `--industry <name>` flag on `paris search` and `paris footprint`, plus a "Default industry" entry in the interactive **Settings** menu.
- Curated `INDUSTRY_KEYWORDS` map covering 19 verticals: **saas, fintech, healthcare, biotech, real-estate, education, manufacturing, marketing, legal, ecommerce, logistics, energy, hospitality, construction, automotive, media, gaming, nonprofit, consulting**. Common aliases (tech→saas, finance→fintech, law→legal, retail→ecommerce, etc.) are accepted.
- The keywords are OR-grouped and prepended to the query so they compose cleanly with `site:`, country filters, footprint patterns, and CSE.

#### Contact name association — names alongside emails in CSV/JSON
- New `EmailExtractor.extractEmailsWithContext(html, opts)` scans HTML for nearby `<h1>/<h2>/<h3>/<h4>/<strong>/<b>/<title>` tags around each email match and attaches a `name` field when a plausible person name is found in the immediate neighbourhood (≤ 800 bytes back, ≤ 400 bytes forward).
- The "name" heuristic accepts 2–4 capitalised tokens with hyphens (Anne-Marie) and apostrophes (O'Brien), uses Unicode property escapes for international names, and rejects boilerplate strings (Login, Home, Sign Up, Privacy, Copyright, …).
- Role-based addresses (`info@`, `sales@`, `contact@`, …) are deliberately NOT name-associated — they don't have an "owner".
- CLI's `extract`, `search`, and `footprint` commands now propagate the `name` through the pipeline. `--format csv` adds a `name` column whenever any record carries one; `--format json` always includes it.
- A small confidence boost (+5) is applied when a name is associated, reflecting the increased contact value.

#### Contextual confidence scoring
- Emails discovered on contact-style URLs (`/contact`, `/contact-us`, `/about`, `/about-us`, `/team`, `/staff`, `/people`, `/leadership`, `/management`, `/directory`, `/profile`, `/bio`) now get a **+10 confidence boost** — these pages strongly suggest a real person at the company.
- Emails discovered on noisy URLs (`/blog`, `/forum`, `/comments`, `/discussions`, `/posts`, `/community`, `/topic`, `/thread`, `/reviews`, `/testimonials`) get a **−10 confidence penalty** — these pages are typically full of user-generated content.
- Combines naturally with `--follow-contact` (which already crawls those high-value sub-pages) so deep-DB results converge on legitimate contacts.

### Future work (intentionally not in this release)
The following items from the user's wishlist require either heavy new dependencies, real outbound network/SMTP infrastructure that can't be exercised in CI, or a full UI rewrite that won't fit in a single PR. They are tracked separately and will land in their own PRs:
- **Catch-all domain detection** (needs SMTP RCPT probes on outbound port 25, frequently blocked / graylisted; needs a dedicated PR with replay-based integration tests).
- **PDF / DOCX content extraction** (needs `pdf-parse` / `mammoth`, which would balloon the `pkg`-built single-file binary).
- **JavaScript-rendered deep scan** via headless browser (needs Puppeteer or Playwright with a > 200 MB Chromium download — must be optional install).
- **Extension popup History tab** (full UI rewrite of `popup/popup.html`).
- **Unified CLI ↔ extension history sync** (needs transport + merge semantics).
- **Electron / Tauri Desktop GUI** (multi-PR effort).

### Compatibility
- Browser extension and Manifest V3: unchanged. The shared `EmailExtractor` improvements (clean local-part check, name association) apply automatically because `content/email-extractor.js` is loaded by both the content scripts and the service worker.
- All existing CLI flags continue to work; `--include-isp` is a no-op alias.

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
