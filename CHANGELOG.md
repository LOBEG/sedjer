# Changelog

All notable changes to Paris Email Extractor will be documented in this file.

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
