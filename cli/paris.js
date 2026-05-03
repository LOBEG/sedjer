#!/usr/bin/env node
/**
 * Paris Email Extractor — Standalone CLI
 * --------------------------------------
 *
 * A Node.js front-end that re-uses the SAME EmailExtractor module that the
 * browser extension uses (../content/email-extractor.js), so behaviour stays
 * 100% in sync between the two distribution channels.
 *
 * Capabilities:
 *   extract  <url|path>            – pull emails from a remote page or local file
 *   search   <query>               – run a search-engine query, deep-scan results
 *   footprint <name>               – run a built-in footprint by partial name match
 *   permute  <first> <last> <dom>  – generate corporate email permutations
 *   mx       <email...>            – MX-validate one or more email addresses
 *   list-footprints                – print all built-in footprints
 *
 * Designed to run on plain Node ≥ 18 (built-in fetch) and to be packaged into
 * a standalone Windows / macOS / Linux executable with `pkg` (see
 * `package.json` → `pkg` section).  The browser extension is unaffected.
 */
'use strict';

var fs       = require('fs');
var path     = require('path');
var http     = require('http');
var https    = require('https');
var url      = require('url');
var dns      = require('dns');
var dnsp     = dns.promises;
var zlib     = require('zlib');

// ── Load the shared EmailExtractor module ──────────────────────────────────
// The extractor is a UMD-style IIFE that exports onto `globalThis.self`.
globalThis.self = globalThis;
require(path.join(__dirname, '..', 'content', 'email-extractor.js'));
var EmailExtractor = globalThis.EmailExtractor;
if (!EmailExtractor) {
    console.error('FATAL: EmailExtractor module failed to load.');
    process.exit(2);
}

// Resolve the package version once so banners, --version, and the
// User-Agent header all stay in sync with package.json.
var PARIS_VERSION = (function () {
    try {
        return require(path.join(__dirname, '..', 'package.json')).version || '0.0.0';
    } catch (e) {
        return '0.0.0';
    }
})();

// ── Built-in footprints ─────────────────────────────────────────────────────
// We can't `require` background/api.js directly (Chrome-extension globals).
// Strip the leading IIFE and pull out _builtinFootprints by evaluating only
// that array literal in a sandboxed scope.
var BUILTIN_FOOTPRINTS = (function loadFootprints() {
    try {
        var src = fs.readFileSync(path.join(__dirname, '..', 'background', 'api.js'), 'utf8');
        var start = src.indexOf('var _builtinFootprints');
        if (start < 0) return [];
        var openBracket = src.indexOf('[', start);
        if (openBracket < 0) return [];

        // Walk forward, counting brackets, ignoring string and comment contents.
        var i = openBracket;
        var depth = 0;
        var inStr = null;       // '"' / "'" / "`" while inside a string
        var esc = false;
        var inLine = false;     // inside `// …` line comment
        var inBlock = false;    // inside `/* … */` block comment
        while (i < src.length) {
            var ch = src[i];
            var nx = src[i + 1];
            if (inStr) {
                if (esc) { esc = false; }
                else if (ch === '\\') { esc = true; }
                else if (ch === inStr) { inStr = null; }
            } else if (inLine) {
                if (ch === '\n') inLine = false;
            } else if (inBlock) {
                if (ch === '*' && nx === '/') { inBlock = false; i++; }
            } else {
                if (ch === '/' && nx === '/') { inLine = true; i++; }
                else if (ch === '/' && nx === '*') { inBlock = true; i++; }
                else if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; }
                else if (ch === '[') { depth++; }
                else if (ch === ']') { depth--; if (depth === 0) { i++; break; } }
            }
            i++;
        }
        var literal = src.substring(openBracket, i);
        // eslint-disable-next-line no-new-func
        return Function('"use strict";return (' + literal + ');')();
    } catch (e) {
        console.error('Failed to load built-in footprints:', e.message);
        return [];
    }
})();

// ── HTTP fetch with redirect / gzip / timeout (no extra deps) ───────────────
function fetchUrl(target, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 20000;
    var maxRedirects = opts.maxRedirects != null ? opts.maxRedirects : 5;
    return new Promise(function (resolve, reject) {
        var parsed;
        try { parsed = url.parse(target); }
        catch (e) { return reject(new Error('Bad URL: ' + target)); }
        var lib = parsed.protocol === 'http:' ? http : https;
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return reject(new Error('Unsupported protocol: ' + parsed.protocol));
        }
        var req = lib.request({
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.path,
            method: 'GET',
            headers: Object.assign({
                'User-Agent': 'Mozilla/5.0 (compatible; Paris Email Extractor/' + PARIS_VERSION + '; +https://github.com/LOBEG/sedjer)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'en-US,en;q=0.9'
            }, opts.headers || {})
        }, function (res) {
            // Redirect
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
                res.resume();
                var next = url.resolve(target, res.headers.location);
                return fetchUrl(next, Object.assign({}, opts, { maxRedirects: maxRedirects - 1 }))
                    .then(resolve, reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode + ' for ' + target));
            }
            var stream = res;
            var enc = (res.headers['content-encoding'] || '').toLowerCase();
            if (enc === 'gzip')      stream = res.pipe(zlib.createGunzip());
            else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

            var chunks = [];
            var totalLen = 0;
            var maxBytes = opts.maxBytes || 5 * 1024 * 1024; // 5 MB cap
            stream.on('data', function (c) {
                totalLen += c.length;
                if (totalLen > maxBytes) {
                    req.destroy(new Error('Response exceeded ' + maxBytes + ' bytes'));
                    return;
                }
                chunks.push(c);
            });
            stream.on('end', function () {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
            stream.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, function () { req.destroy(new Error('Timeout after ' + timeoutMs + 'ms')); });
        req.end();
    });
}

// ── Concurrency-limited mapper (parallel fetch tuning) ──────────────────────
function pMap(items, concurrency, fn, onProgress) {
    concurrency = Math.max(1, concurrency | 0);
    return new Promise(function (resolve) {
        var results = new Array(items.length);
        var i = 0, completed = 0, inFlight = 0;
        if (items.length === 0) return resolve(results);

        function next() {
            while (inFlight < concurrency && i < items.length) {
                var idx = i++;
                inFlight++;
                Promise.resolve()
                    .then(function () { return fn(items[idx], idx); })
                    .then(function (r) { results[idx] = { ok: true, value: r }; },
                          function (e) { results[idx] = { ok: false, error: e }; })
                    .then(function () {
                        inFlight--;
                        completed++;
                        if (onProgress) onProgress(completed, items.length);
                        if (completed === items.length) resolve(results);
                        else next();
                    });
            }
        }
        next();
    });
}

// ── HTML → scannable text (mirrors background/runner.js _deepFetchPage) ─────
//
// We strip three classes of content BEFORE the email regex sees the page:
//
//   1. <script> and <style> blocks     — never user-visible content
//   2. HTML comments                    — sometimes contain stale honeypot
//                                         email addresses
//   3. Hidden elements                  — `display:none`, `visibility:hidden`,
//                                         `opacity:0`, the `hidden` HTML
//                                         attribute, `aria-hidden="true"`,
//                                         and the conventional
//                                         screen-reader-only class names
//                                         (`sr-only`, `visually-hidden`,
//                                         `screen-reader-text`,
//                                         `u-hidden-visually`).
//
// The third class is critical: many lead-gen sites plant truncated /
// fake addresses inside hidden elements as scraper honeypots, and many
// social-card components plant the platform NAME ("Facebook", "LinkedIn")
// inside an SR-only span sitting RIGHT BEFORE the real <a> link. After
// tag-stripping those text nodes can collapse onto the email's local-part,
// which is the root cause of "facebookjohn@gmail.com"-style results.
//
// Removing the hidden subtree at this stage fixes both problems at once
// without disturbing any visible text on the page.
function _stripHiddenElements(html) {
    if (!html || typeof html !== 'string') return html;
    // Drop HTML comments outright — they sometimes preserve old honeypot
    // addresses that real visitors never see.
    var out = html.replace(/<!--[\s\S]*?-->/g, ' ');

    // Strip inline-style hidden / zero-opacity blocks. We match the OPENING
    // tag carrying the hidden style, then non-greedily capture through the
    // matching closing tag for the same element name. JS regex has no
    // recursive matching so deeply-nested hidden trees are handled by
    // running the pass twice — once is enough for the ~99% case.
    var hiddenStyleAttr = '(?:style\\s*=\\s*"[^"]*(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden|opacity\\s*:\\s*0(?![\\d.])|font-size\\s*:\\s*0(?![\\d.]))[^"]*"' +
                           "|style\\s*=\\s*'[^']*(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden|opacity\\s*:\\s*0(?![\\d.])|font-size\\s*:\\s*0(?![\\d.]))[^']*')";
    var hiddenAttrs = '(?:' +
        hiddenStyleAttr + '|' +
        '\\bhidden(?=[\\s>])' + '|' +
        'aria-hidden\\s*=\\s*["\']true["\']' + '|' +
        'class\\s*=\\s*"[^"]*\\b(?:sr-only|visually-hidden|screen-reader-text|u-hidden-visually|hidden-visually|element-invisible|usa-sr-only)\\b[^"]*"' + '|' +
        "class\\s*=\\s*'[^']*\\b(?:sr-only|visually-hidden|screen-reader-text|u-hidden-visually|hidden-visually|element-invisible|usa-sr-only)\\b[^']*'" +
        ')';

    // For each common inline/block element that can carry hidden state,
    // strip the whole subtree. Self-closing void elements have no content
    // to strip, but we still drop the tag itself.
    var elementNames = ['span', 'div', 'p', 'a', 'li', 'ul', 'ol', 'section',
        'article', 'aside', 'header', 'footer', 'nav', 'figure', 'figcaption',
        'em', 'strong', 'b', 'i', 'small', 'label', 'time', 'address',
        'mark', 'q', 'cite', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main',
        'details', 'summary', 'fieldset', 'legend', 'pre', 'code', 'blockquote'];
    var nameAlt = elementNames.join('|');
    var hiddenBlockRe = new RegExp(
        '<(' + nameAlt + ')\\b[^>]*' + hiddenAttrs + '[^>]*>[\\s\\S]*?</\\s*\\1\\s*>',
        'gi'
    );
    // Two passes catch one level of nesting (hidden→hidden) in practice.
    out = out.replace(hiddenBlockRe, ' ').replace(hiddenBlockRe, ' ');
    return out;
}

function htmlToScannable(html) {
    html = _stripHiddenElements(html);
    var preserved = [];
    var m;

    var mailtoRe = /mailto:([^"'>\s)]+)/gi;
    while ((m = mailtoRe.exec(html)) !== null) {
        preserved.push(m[1]);
        if (m.index === mailtoRe.lastIndex) mailtoRe.lastIndex++;
    }
    var jsonldRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/\s*script[^>]*>/gi;
    while ((m = jsonldRe.exec(html)) !== null) {
        preserved.push(m[1]);
        if (m.index === jsonldRe.lastIndex) jsonldRe.lastIndex++;
    }
    var metaRe = /<meta[^>]*(?:name|property)\s*=\s*["']([^"']*)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
    while ((m = metaRe.exec(html)) !== null) {
        var n = m[1].toLowerCase();
        if (n.indexOf('email') > -1 || n.indexOf('contact') > -1) preserved.push(m[2]);
        if (m.index === metaRe.lastIndex) metaRe.lastIndex++;
    }
    var dataAttrRe = /data-(?:email|contact)\s*=\s*["']([^"']+)["']/gi;
    while ((m = dataAttrRe.exec(html)) !== null) {
        preserved.push(m[1]);
        if (m.index === dataAttrRe.lastIndex) dataAttrRe.lastIndex++;
    }

    // Strip script/style/tags then decode common HTML entities; decode &amp; LAST
    // to avoid double-unescaping (matches the extension exactly).
    var bodyText = html.replace(/<script\b[^>]*>[\s\S]*?<\/\s*script[^>]*>/gi, ' ')
                       .replace(/<style\b[^>]*>[\s\S]*?<\/\s*style[^>]*>/gi, ' ')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/&nbsp;/gi, ' ')
                       .replace(/&quot;/gi, '"')
                       .replace(/&lt;/gi, '<')
                       .replace(/&gt;/gi, '>')
                       .replace(/&#(\d+);/g, function (_, code) {
                           try { return String.fromCharCode(parseInt(code, 10)); }
                           catch (e) { return ' '; }
                       })
                       .replace(/&amp;/gi, '&');
    return preserved.join('\n') + '\n' + bodyText;
}

function extractFromHtml(html, urlForPlatform, filterOptions) {
    var platformInfo = urlForPlatform
        ? EmailExtractor.detectPlatform(urlForPlatform)
        : { platform: 'generic', isLinkedIn: false, isDataPlatform: false };
    var text = htmlToScannable(html);
    var extracted = EmailExtractor.extractEmails(text, {
        isLinkedIn: !!platformInfo.isLinkedIn,
        isDataPlatform: !!platformInfo.isDataPlatform,
        rfcStrict: !!(filterOptions && filterOptions.rfcStrict)
    });
    var filtered = EmailExtractor.filterEmails(extracted, filterOptions || {
        minConfidence: 0,
        excludeRoles: true,
        // Default: KEEP gmail/yahoo/outlook/etc. so users see them.
        // Pass `--exclude-isp` (or set excludeISP:true) to drop them.
        excludeISP: false
    });
    return filtered;
}

// Build the standard filter-options bag from CLI flags. Centralised so
// every command (extract / search / footprint) treats the flags the same way.
//
// As of v4.6 the default is to KEEP personal/ISP addresses (gmail, yahoo,
// outlook, …). Pass `--exclude-isp` to drop them. The legacy `--include-isp`
// flag is still accepted as a no-op alias so old scripts keep working.
function _filterOptsFromArgs(args) {
    var minC = args.flags['min-confidence'] != null
        ? parseInt(args.flags['min-confidence'], 10)
        : (args.flags.strict ? 30 : 0);
    var opts = {
        minConfidence: minC,
        excludeISP:    !!args.flags['exclude-isp'],
        excludeRoles:  !args.flags['include-roles'],
        rfcStrict:     !!args.flags['rfc-strict']
    };
    if (args.flags.domain) opts.domainPattern = String(args.flags.domain).replace(/^@/, '');
    if (args.flags['exclude-catchall']) opts.excludeCatchAll = true;
    return opts;
}

// ── DuckDuckGo HTML SERP scraper ────────────────────────────────────────────
// Uses the no-JS endpoint at https://html.duckduckgo.com/html/, which returns
// a static results page that's safe to parse with regex.
function ddgSearchUrls(query, maxPages) {
    maxPages = Math.max(1, maxPages | 0);
    var results = [];
    var page = 0;
    function pull() {
        if (page >= maxPages) return Promise.resolve(results);
        var q = encodeURIComponent(query);
        var s = page * 30;
        var u = 'https://html.duckduckgo.com/html/?q=' + q + (s ? '&s=' + s + '&dc=' + s : '');
        return fetchUrl(u, { timeoutMs: 25000 })
            .then(function (resp) {
                // Result links live in <a class="result__a" href="…">. Older
                // layout uses uddg= redirector links — handle both.
                var hrefRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi;
                var m;
                while ((m = hrefRe.exec(resp.body)) !== null) {
                    var href = m[1].replace(/&amp;/g, '&');
                    // Some DDG variants wrap real URLs as /l/?uddg=<encoded>
                    var u2 = href;
                    var idx = href.indexOf('uddg=');
                    if (idx >= 0) {
                        try { u2 = decodeURIComponent(href.substring(idx + 5).split('&')[0]); }
                        catch (e) { /* keep original */ }
                    }
                    if (/^https?:\/\//i.test(u2) && results.indexOf(u2) === -1) {
                        results.push(u2);
                    }
                }
                page++;
                // Be polite between SERP pages.
                return new Promise(function (r) { setTimeout(r, 1500); }).then(pull);
            })
            .catch(function (err) {
                process.stderr.write('  DDG page ' + (page + 1) + ' failed: ' + err.message + '\n');
                return results;
            });
    }
    return pull();
}

// ── Google Programmable Search Engine (CSE) result scraper ──────────────────
//
// When the user has set up a CSE (see cse/CSE.md) and provides a `cx`
// (per-command --cse flag, PARIS_CSE_CX env var, or the menu setting), we
// route the query through Google's PUBLIC results page rather than the
// DDG scraper. No API key required — we parse the same way DDG is parsed.
//
// CSE renders 10 hits per page. We dedupe and stop when a page produces
// nothing new (Google often serves <10 if the query is rare).
//
// On ANY hard failure (HTTP error, zero hits) we silently fall back to
// DuckDuckGo so existing workflows keep working.
function cseSearchUrls(query, maxPages, cx) {
    if (!cx) return ddgSearchUrls(query, maxPages);
    maxPages = Math.max(1, maxPages | 0);
    var results = [];
    var page = 0;
    var safeCx = encodeURIComponent(String(cx).trim());
    function pull() {
        if (page >= maxPages) return Promise.resolve(results);
        var q = encodeURIComponent(query);
        var start = page * 10;
        var u = 'https://cse.google.com/cse?cx=' + safeCx + '&q=' + q +
                (start ? '&start=' + start : '');
        return fetchUrl(u, { timeoutMs: 25000 })
            .then(function (resp) {
                var before = results.length;
                // CSE result anchors: <a class="gs-title" href="https://…">
                // Google's elements API also embeds them as JSON inside a
                // gsc-result element; the simple href grab is sufficient
                // for both layouts.
                var hrefRe = /<a[^>]+class="[^"]*gs-title[^"]*"[^>]+href="([^"]+)"/gi;
                var m;
                while ((m = hrefRe.exec(resp.body)) !== null) {
                    var href = m[1].replace(/&amp;/g, '&');
                    if (/^https?:\/\//i.test(href) && results.indexOf(href) === -1) {
                        results.push(href);
                    }
                }
                if (results.length === before) {
                    // CSE returned no new hits — bail out of pagination.
                    return results;
                }
                page++;
                return new Promise(function (r) { setTimeout(r, 1500); }).then(pull);
            })
            .catch(function (err) {
                process.stderr.write('  CSE page ' + (page + 1) + ' failed: ' + err.message + '\n');
                return results;
            });
    }
    return pull().then(function (urls) {
        if (urls.length > 0) return urls;
        process.stderr.write('  CSE returned 0 results — falling back to DuckDuckGo\n');
        return ddgSearchUrls(query, maxPages);
    });
}

// Resolve which engine to use for a search command. Priority:
//   1. --cse <cx> flag on the command
//   2. PARIS_CSE_CX environment variable
//   3. INTERACTIVE_SETTINGS.cseCx (set via the menu)
//   4. nothing → use DuckDuckGo
function _resolveCseCx(args) {
    if (args && args.flags && args.flags.cse) return String(args.flags.cse).trim();
    if (process.env.PARIS_CSE_CX) return String(process.env.PARIS_CSE_CX).trim();
    if (typeof INTERACTIVE_SETTINGS !== 'undefined' && INTERACTIVE_SETTINGS && INTERACTIVE_SETTINGS.cseCx) {
        return String(INTERACTIVE_SETTINGS.cseCx).trim();
    }
    return '';
}

function searchUrls(query, maxPages, args) {
    var cx = _resolveCseCx(args);
    if (cx) return cseSearchUrls(query, maxPages, cx);
    return ddgSearchUrls(query, maxPages);
}

// ── MX validation (Node native DNS) ─────────────────────────────────────────
var _mxCache = {};
function checkMx(domain) {
    if (_mxCache.hasOwnProperty(domain)) return Promise.resolve(_mxCache[domain]);
    return dnsp.resolveMx(domain)
        .then(function (records) {
            var ok = Array.isArray(records) && records.length > 0;
            _mxCache[domain] = ok;
            return ok;
        })
        .catch(function () {
            // Fall back to A/AAAA: a server with mail handling may still receive.
            return dnsp.resolve(domain).then(function () { _mxCache[domain] = true; return true; })
                .catch(function () { _mxCache[domain] = false; return false; });
        });
}
function validateEmailMx(emails, concurrency) {
    var byDomain = {};
    emails.forEach(function (e) {
        var d = String(e).split('@')[1];
        if (!d) return;
        d = d.toLowerCase();
        if (!byDomain[d]) byDomain[d] = [];
        byDomain[d].push(e);
    });
    var domains = Object.keys(byDomain);
    var valid = [], invalid = [];
    return pMap(domains, concurrency || 8, function (d) {
        return checkMx(d).then(function (ok) {
            if (ok) valid = valid.concat(byDomain[d]);
            else    invalid = invalid.concat(byDomain[d]);
        });
    }).then(function () { return { valid: valid, invalid: invalid }; });
}

// ── Output formatting ───────────────────────────────────────────────────────
function formatOutput(records, fmt) {
    fmt = (fmt || 'txt').toLowerCase();
    if (fmt === 'json') return JSON.stringify(records, null, 2);
    if (fmt === 'csv') {
        var lines = ['email,source,confidence,sourceUrl'];
        records.forEach(function (r) {
            var safe = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
            lines.push([safe(r.email), safe(r.source || ''), safe(r.confidence || ''), safe(r.sourceUrl || '')].join(','));
        });
        return lines.join('\n');
    }
    return records.map(function (r) { return r.email; }).join('\n');
}

// Resolve the user's Desktop folder for the current OS, with sensible
// fallbacks when it doesn't exist (headless runners, locked-down
// containers, etc.). Returns an absolute path that is guaranteed to be
// writable, falling back to the home directory and finally CWD.
function resolveDesktopPath() {
    var home = process.env.HOME || process.env.USERPROFILE || '';
    var candidates = [];
    if (home) {
        candidates.push(path.join(home, 'Desktop'));
        // OneDrive / localised Desktop on Windows
        if (process.env.OneDrive) candidates.push(path.join(process.env.OneDrive, 'Desktop'));
        if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop'));
    }
    for (var i = 0; i < candidates.length; i++) {
        try {
            if (fs.existsSync(candidates[i]) && fs.statSync(candidates[i]).isDirectory()) {
                return candidates[i];
            }
        } catch (e) { /* try next */ }
    }
    // Try to create ~/Desktop if it doesn't exist
    if (home) {
        try {
            var p = path.join(home, 'Desktop');
            fs.mkdirSync(p, { recursive: true });
            return p;
        } catch (e) { /* fall through */ }
    }
    return home || process.cwd();
}

// Sanitise an arbitrary string into something that's safe to embed in a
// filename on every OS (Windows banishes < > : " / \ | ? *; macOS dislikes
// : in legacy paths). Collapses runs of whitespace/punct to a single dash,
// trims, and clamps to a reasonable length so the final filename never
// blows past the 255-byte filesystem limit.
function slugifyForFilename(s) {
    if (!s) return '';
    return String(s)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')           // strip diacritics
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')   // illegal on Windows
        .replace(/[^A-Za-z0-9._@+-]+/g, '-')       // anything else → dash
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 60);
}

// Build a default desktop filename for a given command + format. When a
// `label` is provided (e.g. the footprint name, the URL host being scraped,
// or a slug of a search query) it gets baked into the filename so the
// saved file is self-describing — `paris-Apollo.io-2026-05-02_15-30-12.csv`
// instead of the generic `paris-footprint-…`.
// Pick a sensible "label" for the saved filename. Used by every command
// that calls writeOutput({ desktop: true }) so the file on disk is
// self-describing rather than the generic "paris-extract-…".
function _labelFromExtractTarget(target) {
    if (!target) return '';
    if (/^https?:\/\//i.test(target)) {
        try { return new URL(target).hostname.replace(/^www\./, ''); }
        catch (e) { return target; }
    }
    // Strip directory + extension for local files
    return String(target).split(/[\\/]/).pop().replace(/\.[a-z0-9]{1,6}$/i, '');
}

// Compress a search query into a short label suitable for a filename.
// Drops operators (site:, intext:, "), keeps the first few content words.
function _labelFromSearchQuery(q) {
    if (!q) return '';
    var s = String(q)
        .replace(/"/g, ' ')
        .replace(/\b(site|intext|inurl|intitle|filetype|after|before):\S+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // Take the first few words to keep the filename short.
    return s.split(' ').slice(0, 4).join(' ');
}

function defaultDesktopFilename(command, fmt, label) {
    var ext = (fmt === 'json' || fmt === 'csv' || fmt === 'txt') ? fmt : 'txt';
    var ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    var slug = slugifyForFilename(label);
    var middle = slug ? slug : (command || 'leads');
    return 'paris-' + middle + '-' + ts + '.' + ext;
}

function writeOutput(text, outFile, opts) {
    opts = opts || {};
    // --desktop wins over --out=null but loses to an explicit --out.
    if (!outFile && opts.desktop) {
        outFile = path.join(resolveDesktopPath(), defaultDesktopFilename(opts.command, opts.fmt, opts.label));
    }
    if (outFile) {
        try {
            var dir = path.dirname(outFile);
            if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        } catch (e) { /* let writeFileSync produce the real error */ }
        fs.writeFileSync(outFile, text, 'utf8');
        process.stderr.write('Wrote ' + outFile + '\n');
    } else {
        process.stdout.write(text);
        if (!text.endsWith('\n')) process.stdout.write('\n');
    }
    return outFile || null;
}

// ── Country → TLD map (ISO 3166-1 alpha-2 → primary ccTLD list) ────────────
// Used by the `--country` flag on `search` / `footprint` to inject a
// `site:.<tld>` filter into queries so results are restricted to that
// country's web. Codes are case-insensitive.
var COUNTRY_TLDS = {
    US: ['us', 'com'], GB: ['uk', 'co.uk'], UK: ['uk', 'co.uk'], CA: ['ca'],
    AU: ['au', 'com.au'], NZ: ['nz', 'co.nz'], IE: ['ie'],
    IN: ['in', 'co.in'], SG: ['sg', 'com.sg'], HK: ['hk', 'com.hk'],
    MY: ['my', 'com.my'], ID: ['id', 'co.id'], TH: ['th', 'co.th'],
    PH: ['ph', 'com.ph'], VN: ['vn', 'com.vn'],
    JP: ['jp', 'co.jp'], KR: ['kr', 'co.kr'], CN: ['cn', 'com.cn'],
    TW: ['tw', 'com.tw'],
    AE: ['ae', 'com.ae'], SA: ['sa', 'com.sa'], QA: ['qa', 'com.qa'],
    KW: ['kw', 'com.kw'], BH: ['bh', 'com.bh'], OM: ['om', 'com.om'],
    IL: ['il', 'co.il'], TR: ['tr', 'com.tr'],
    EG: ['eg', 'com.eg'], MA: ['ma', 'co.ma'], ZA: ['za', 'co.za'],
    NG: ['ng', 'com.ng'], KE: ['ke', 'co.ke'], GH: ['gh', 'com.gh'],
    DE: ['de'], FR: ['fr'], ES: ['es'], IT: ['it'], NL: ['nl'], BE: ['be'],
    CH: ['ch'], AT: ['at'], SE: ['se'], NO: ['no'], DK: ['dk'], FI: ['fi'],
    IS: ['is'], PT: ['pt'], GR: ['gr'], PL: ['pl'], CZ: ['cz'], SK: ['sk'],
    HU: ['hu'], RO: ['ro'], BG: ['bg'], HR: ['hr'], SI: ['si'], RS: ['rs'],
    EE: ['ee'], LV: ['lv'], LT: ['lt'],
    RU: ['ru'], UA: ['ua'], BY: ['by'],
    BR: ['br', 'com.br'], MX: ['mx', 'com.mx'], AR: ['ar', 'com.ar'],
    CL: ['cl'], CO: ['co', 'com.co'], PE: ['pe', 'com.pe'],
    VE: ['ve', 'com.ve'], UY: ['uy', 'com.uy']
};

function countryFilter(code) {
    if (!code) return null;
    var c = String(code).toUpperCase().replace(/[^A-Z]/g, '');
    var tlds = COUNTRY_TLDS[c];
    if (!tlds || !tlds.length) return null;
    if (tlds.length === 1) return 'site:.' + tlds[0];
    return '(' + tlds.map(function (t) { return 'site:.' + t; }).join(' OR ') + ')';
}

function applyCountryFilter(query, code) {
    var f = countryFilter(code);
    if (!f) return query;
    // Skip if the query already restricts to one of this country's TLDs
    // anywhere in the line, so we don't produce redundant filters like
    // `(site:.us OR site:.com) site:.us "@" foo`.
    var c = String(code).toUpperCase().replace(/[^A-Z]/g, '');
    var tlds = COUNTRY_TLDS[c] || [];
    for (var i = 0; i < tlds.length; i++) {
        if (query.indexOf('site:.' + tlds[i]) !== -1) return query;
    }
    // Prepend so it's applied first; existing site: operators still work.
    return f + ' ' + query;
}

// ── Sub-page following for "deep DB" extraction ────────────────────────────
// After fetching a page, also fetch a small set of well-known contact-related
// sub-paths (depth 1) so we pick up emails that live one click away from the
// landing page. This is the "deep into database" mode requested by users.
var CONTACT_SUBPATHS = [
    '/contact', '/contact-us', '/contact_us',
    '/about', '/about-us', '/about_us',
    '/team', '/our-team', '/people', '/staff',
    '/leadership', '/management', '/directory', '/employees',
    '/impressum'   // German legal-imprint pages typically list emails
];

function followContactSubpages(baseUrl, opts) {
    opts = opts || {};
    var concurrency = opts.concurrency || 4;
    var timeoutMs   = opts.timeoutMs   || 15000;
    var origin;
    try {
        var u = url.parse(baseUrl);
        if (!u.protocol || !u.hostname) return Promise.resolve([]);
        origin = u.protocol + '//' + u.host;
    } catch (e) { return Promise.resolve([]); }
    var targets = CONTACT_SUBPATHS.map(function (p) { return origin + p; });
    return pMap(targets, concurrency, function (t) {
        return fetchUrl(t, { timeoutMs: timeoutMs })
            .then(function (resp) { return { url: t, html: resp.body }; })
            .catch(function () { return null; });
    }).then(function (results) {
        return results.map(function (r) { return r && r.ok ? r.value : null; })
                      .filter(function (r) { return r && r.html; });
    });
}


// ── Persistent extraction history (skip-seen across runs) ──────────────────
// Re-running the CLI with the same query/footprint should NOT re-emit emails
// you've already collected in a previous run. We persist a tiny JSON file
// keyed by lowercased email → { firstSeen, lastSeen, sourceUrl, footprint,
// command }. Default location is ~/.paris-email-extractor/history.json
// (overridable with --history <path> or the PARIS_HISTORY env var).
//
// On every run we:
//   • Load history once into an in-memory map (HISTORY_MAP)
//   • Filter out any extracted record whose email is already present
//     (unless --no-skip-seen is passed)
//   • Append every newly emitted email back to the history before exit
//
// The browser extension implements a parallel feature in popup/query.js
// using chrome.storage.local.seenEmails so behaviour is consistent across
// the standalone exe and the extension.
function _defaultHistoryPath() {
    if (process.env.PARIS_HISTORY) return process.env.PARIS_HISTORY;
    var home = process.env.HOME || process.env.USERPROFILE || '.';
    return path.join(home, '.paris-email-extractor', 'history.json');
}

var HISTORY_PATH = null;   // resolved on first call
var HISTORY_MAP  = null;   // { emailLower: { firstSeen, lastSeen, ... } }
var HISTORY_DIRTY = false;

function _isoDay(d) {
    // Accepts a Date, ISO string, or YYYY-MM-DD; returns YYYY-MM-DD.
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    var s = String(d || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var parsed = new Date(s);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function loadHistory(customPath) {
    if (HISTORY_MAP) return HISTORY_MAP;
    HISTORY_PATH = customPath || _defaultHistoryPath();
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            var raw = fs.readFileSync(HISTORY_PATH, 'utf8');
            var parsed = JSON.parse(raw);
            // Forward-compat: accept either { emails: {...} } or a flat map.
            HISTORY_MAP = (parsed && typeof parsed === 'object' && parsed.emails && typeof parsed.emails === 'object')
                ? parsed.emails
                : (parsed && typeof parsed === 'object' ? parsed : {});
        } else {
            HISTORY_MAP = {};
        }
    } catch (e) {
        process.stderr.write('Warning: history file unreadable (' + e.message + ') — starting fresh\n');
        HISTORY_MAP = {};
    }
    return HISTORY_MAP;
}

function recordHistory(records, meta) {
    if (!records || !records.length) return;
    if (!HISTORY_MAP) loadHistory();
    var now = new Date().toISOString();
    meta = meta || {};
    records.forEach(function (r) {
        if (!r || !r.email) return;
        var key = String(r.email).toLowerCase();
        var prev = HISTORY_MAP[key];
        if (prev) {
            prev.lastSeen = now;
            if (meta.command) prev.lastCommand = meta.command;
            if (r.sourceUrl) prev.lastSourceUrl = r.sourceUrl;
            if (meta.footprint) prev.lastFootprint = meta.footprint;
        } else {
            HISTORY_MAP[key] = {
                firstSeen: now,
                lastSeen: now,
                sourceUrl: r.sourceUrl || '',
                footprint: meta.footprint || '',
                command: meta.command || '',
                source: r.source || '',
                confidence: r.confidence || 0
            };
        }
        HISTORY_DIRTY = true;
    });
}

function saveHistory() {
    if (!HISTORY_DIRTY || !HISTORY_PATH) return;
    try {
        var dir = path.dirname(HISTORY_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        var payload = {
            version: 1,
            updatedAt: new Date().toISOString(),
            emails: HISTORY_MAP
        };
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(payload, null, 2), 'utf8');
        HISTORY_DIRTY = false;
    } catch (e) {
        process.stderr.write('Warning: failed to write history (' + e.message + ')\n');
    }
}

// True if email should be SKIPPED based on --since/--until/skip-seen rules.
function isInHistory(email, sinceDay, untilDay) {
    if (!HISTORY_MAP) return false;
    var rec = HISTORY_MAP[String(email).toLowerCase()];
    if (!rec) return false;
    var firstDay = (rec.firstSeen || '').slice(0, 10);
    if (sinceDay && firstDay && firstDay < sinceDay) return false; // before window — keep
    if (untilDay && firstDay && firstDay > untilDay) return false; // after window — keep
    return true;
}

// Apply skip-seen + date-window filtering to a freshly-extracted batch.
function applyHistoryFilter(records, opts) {
    opts = opts || {};
    var skipSeen = opts.skipSeen !== false;
    var sinceDay = _isoDay(opts.since);
    var untilDay = _isoDay(opts.until);
    if (!skipSeen && !sinceDay && !untilDay) return records;
    if (skipSeen && !HISTORY_MAP) loadHistory(opts.historyPath);
    var skipped = 0;
    var kept = records.filter(function (r) {
        if (!r || !r.email) return false;
        if (skipSeen && isInHistory(r.email, sinceDay, untilDay)) {
            skipped++;
            return false;
        }
        return true;
    });
    if (skipped) process.stderr.write('  (skipped ' + skipped + ' email[s] already in history)\n');
    return kept;
}

// Read-only helper for the `history` sub-command + tests.
function getHistory() {
    if (!HISTORY_MAP) loadHistory();
    return HISTORY_MAP;
}

// Inject Google search-engine date operators when the user passes
// --after / --before to bias discovery toward fresh content.
function applyDateRangeToQuery(query, after, before) {
    var afterDay  = _isoDay(after);
    var beforeDay = _isoDay(before);
    var ops = [];
    if (afterDay)  ops.push('after:'  + afterDay);
    if (beforeDay) ops.push('before:' + beforeDay);
    if (!ops.length) return query;
    return ops.join(' ') + ' ' + query;
}

// Make sure history is flushed on every exit path (success, error, signal).
function _installHistorySaveOnExit() {
    if (_installHistorySaveOnExit._done) return;
    _installHistorySaveOnExit._done = true;
    var save = function () { try { saveHistory(); } catch (e) { /* noop */ } };
    process.on('exit', save);
    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(function (sig) {
        process.on(sig, function () { save(); process.exit(130); });
    });
}

function parseArgs(argv) {
    var pos = [];
    var flags = {};
    for (var i = 0; i < argv.length; i++) {
        var a = argv[i];
        if (a.indexOf('--') === 0) {
            var key = a.substring(2);
            var eq = key.indexOf('=');
            var val;
            if (eq >= 0) { val = key.substring(eq + 1); key = key.substring(0, eq); }
            else if (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) { val = argv[++i]; }
            else { val = true; }
            flags[key] = val;
        } else {
            pos.push(a);
        }
    }
    return { pos: pos, flags: flags };
}

// Build a single `historyOpts` object from the parsed CLI flags.
function _historyOptsFromArgs(args) {
    return {
        skipSeen:    args.flags['no-skip-seen'] ? false : true,
        since:       args.flags.since  || null,
        until:       args.flags.until  || null,
        historyPath: args.flags.history || null
    };
}

// ── Commands ────────────────────────────────────────────────────────────────
function cmdExtract(args) {
    var target = args.pos[0];
    if (!target) {
        console.error('usage: paris extract <url|file> [--out F] [--format json|csv|txt] [--exclude-isp] [--include-roles] [--rfc-strict] [--min-confidence N] [--domain D] [--follow-contact] [--no-skip-seen] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--history PATH]');
        process.exit(1);
    }
    var fmt   = args.flags.format || 'txt';
    var out   = args.flags.out;
    var filterOpts = _filterOptsFromArgs(args);
    var followContact = !!args.flags['follow-contact'];
    var historyOpts = _historyOptsFromArgs(args);
    loadHistory(historyOpts.historyPath);

    var loader;
    if (/^https?:\/\//i.test(target)) {
        loader = fetchUrl(target).then(function (r) { return { html: r.body, src: target }; });
    } else {
        loader = Promise.resolve({ html: fs.readFileSync(target, 'utf8'), src: null });
    }
    return loader.then(function (page) {
        var records = [];
        var seen = {};
        function ingest(html, srcUrl) {
            extractFromHtml(html, srcUrl, filterOpts).forEach(function (r) {
                if (seen[r.email]) return;
                seen[r.email] = true;
                records.push({ email: r.email, source: r.source, confidence: r.confidence, sourceUrl: srcUrl });
            });
        }
        ingest(page.html, page.src);

        function emit(extraNote) {
            var filtered = applyHistoryFilter(records, historyOpts);
            recordHistory(filtered, { command: 'extract' });
            process.stderr.write('Found ' + filtered.length + ' email(s)' + (extraNote || '') + '\n');
            writeOutput(formatOutput(filtered, fmt), out, { fmt: fmt, command: 'extract', label: _labelFromExtractTarget(target), desktop: !!args.flags.desktop });
        }

        if (followContact && page.src) {
            return followContactSubpages(page.src).then(function (pages) {
                pages.forEach(function (p) { ingest(p.html, p.url); });
                emit(' (incl. ' + pages.length + ' sub-page[s])');
            });
        }
        emit('');
    });
}

function cmdSearch(args) {
    var query = args.pos.join(' ');
    if (!query) {
        console.error('usage: paris search "<query>" [--country CC] [--industry NAME] [--max-pages N] [--concurrency N] [--out F] [--format json|csv|txt] [--exclude-isp] [--include-roles] [--rfc-strict] [--min-confidence N] [--strict] [--domain D] [--mx] [--exclude-catchall] [--follow-contact] [--no-skip-seen] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--after YYYY-MM-DD] [--before YYYY-MM-DD] [--cse CX] [--desktop] [--history PATH]');
        process.exit(1);
    }
    var maxPages    = args.flags['max-pages'] != null ? parseInt(args.flags['max-pages'], 10) : 2;
    var concurrency = args.flags.concurrency != null ? parseInt(args.flags.concurrency, 10) : 6;
    var fmt = args.flags.format || 'txt';
    var out = args.flags.out;
    var filterOpts = _filterOptsFromArgs(args);
    var followContact = !!args.flags['follow-contact'];
    var historyOpts = _historyOptsFromArgs(args);
    loadHistory(historyOpts.historyPath);

    if (args.flags.country) {
        var f = countryFilter(args.flags.country);
        if (f) {
            query = applyCountryFilter(query, args.flags.country);
            process.stderr.write('Country filter: ' + f + '\n');
        } else {
            process.stderr.write('Warning: unknown country code "' + args.flags.country + '" — ignored\n');
        }
    }
    if (args.flags.after || args.flags.before) {
        query = applyDateRangeToQuery(query, args.flags.after, args.flags.before);
        process.stderr.write('Date-bounded query: ' + query + '\n');
    }

    var _useCx = _resolveCseCx(args);
    process.stderr.write('Searching ' + (_useCx ? 'Google CSE' : 'DuckDuckGo') + ' for: ' + query + '\n');
    return searchUrls(query, maxPages, args).then(function (urls) {
        process.stderr.write('  ' + urls.length + ' result URL(s) discovered. Deep-scanning with concurrency=' + concurrency + (followContact ? ' (follow-contact ON)' : '') + '\n');
        var allRecords = [];
        var seen = {};
        function ingest(html, srcUrl) {
            extractFromHtml(html, srcUrl, filterOpts).forEach(function (r) {
                if (seen[r.email]) return;
                seen[r.email] = true;
                allRecords.push({ email: r.email, source: r.source, confidence: r.confidence, sourceUrl: srcUrl });
            });
        }
        return pMap(urls, concurrency, function (u) {
            return fetchUrl(u, { timeoutMs: 20000 })
                .then(function (resp) {
                    ingest(resp.body, u);
                    if (!followContact) return null;
                    return followContactSubpages(u, { concurrency: 3 }).then(function (subs) {
                        subs.forEach(function (s) { ingest(s.html, s.url); });
                    });
                })
                .catch(function (err) {
                    process.stderr.write('  fetch failed for ' + u + ': ' + err.message + '\n');
                });
        }, function (done, total) {
            process.stderr.write('\r  scanned ' + done + '/' + total + ', emails so far: ' + allRecords.length + '   ');
        }).then(function () {
            process.stderr.write('\n');
            // Apply history filter and record new emails before MX so that
            // the MX-validation count reflects only fresh emails.
            allRecords = applyHistoryFilter(allRecords, historyOpts);
            recordHistory(allRecords, { command: 'search' });
            if (args.flags.mx) {
                process.stderr.write('Validating MX for ' + allRecords.length + ' email(s)…\n');
                return validateEmailMx(allRecords.map(function (r) { return r.email; }))
                    .then(function (mx) {
                        var validSet = {};
                        mx.valid.forEach(function (e) { validSet[e] = true; });
                        allRecords.forEach(function (r) { r.mxValid = !!validSet[r.email]; });
                        process.stderr.write('  MX-valid: ' + mx.valid.length + ' / invalid: ' + mx.invalid.length + '\n');
                        return allRecords;
                    });
            }
            return allRecords;
        });
    }).then(function (records) {
        writeOutput(formatOutput(records, fmt), out, { fmt: fmt, command: 'search', label: _labelFromSearchQuery(query), desktop: !!args.flags.desktop });
    });
}

function cmdFootprint(args) {
    var name = args.pos.join(' ').toLowerCase();
    if (!name) {
        console.error('usage: paris footprint "<name-substring>" [search-options...]');
        process.exit(1);
    }
    var match = BUILTIN_FOOTPRINTS.find(function (f) {
        return String(f.name).toLowerCase().indexOf(name) !== -1;
    });
    if (!match) {
        console.error('No built-in footprint matched: ' + name);
        process.exit(1);
    }
    var historyOpts = _historyOptsFromArgs(args);
    loadHistory(historyOpts.historyPath);
    process.stderr.write('Footprint: ' + match.name + '\n');
    // A footprint's value can be multi-line — run each line as its own search.
    var queries = String(match.value).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var seen = {};
    var collected = [];
    return queries.reduce(function (chain, q) {
        return chain.then(function () {
            process.stderr.write('-> ' + q + '\n');
            // Inner runSearchInternal must NOT skip-seen on its own (that
            // would double-count); we apply history filtering once after
            // ALL queries have run.
            var innerFlags = Object.assign({}, args.flags, {
                format: 'json',
                out: null,
                'no-skip-seen': true        // suppress inner filter
            });
            var inner = { pos: [q], flags: innerFlags };
            return runSearchInternal(inner).then(function (records) {
                records.forEach(function (r) {
                    if (seen[r.email]) return;
                    seen[r.email] = true;
                    collected.push(r);
                });
            });
        });
    }, Promise.resolve()).then(function () {
        collected = applyHistoryFilter(collected, historyOpts);
        recordHistory(collected, { command: 'footprint', footprint: match.name });
        var fmt = args.flags.format || 'txt';
        writeOutput(formatOutput(collected, fmt), args.flags.out, { fmt: fmt, command: 'footprint', label: match.name, desktop: !!args.flags.desktop });
    });
}

// Like cmdSearch but returns the records array instead of writing.
// History filtering is opt-in here via args.flags so cmdFootprint can
// suppress it during inner queries and apply it once at the end.
function runSearchInternal(args) {
    var query = args.pos.join(' ');
    var maxPages    = args.flags['max-pages'] != null ? parseInt(args.flags['max-pages'], 10) : 2;
    var concurrency = args.flags.concurrency != null ? parseInt(args.flags.concurrency, 10) : 6;
    var filterOpts = _filterOptsFromArgs(args);
    if (args.flags.country) {
        var f = countryFilter(args.flags.country);
        if (f) query = applyCountryFilter(query, args.flags.country);
    }
    if (args.flags.after || args.flags.before) {
        query = applyDateRangeToQuery(query, args.flags.after, args.flags.before);
    }
    var followContact = !!args.flags['follow-contact'];
    var historyOpts = _historyOptsFromArgs(args);
    return searchUrls(query, maxPages, args).then(function (urls) {
        var seen = {};
        var records = [];
        function ingest(html, srcUrl) {
            extractFromHtml(html, srcUrl, filterOpts).forEach(function (r) {
                if (seen[r.email]) return;
                seen[r.email] = true;
                records.push({ email: r.email, source: r.source, confidence: r.confidence, sourceUrl: srcUrl });
            });
        }
        return pMap(urls, concurrency, function (u) {
            return fetchUrl(u, { timeoutMs: 20000 })
                .then(function (resp) {
                    ingest(resp.body, u);
                    if (!followContact) return null;
                    return followContactSubpages(u, { concurrency: 3 }).then(function (subs) {
                        subs.forEach(function (s) { ingest(s.html, s.url); });
                    });
                })
                .catch(function () { /* swallow per-url failures */ });
        }).then(function () {
            return applyHistoryFilter(records, historyOpts);
        });
    });
}

function cmdPermute(args) {
    var first = args.pos[0], last = args.pos[1], dom = args.pos[2];
    if (!first || !last || !dom) {
        console.error('usage: paris permute <firstName> <lastName> <domain> [--middle X] [--unusual] [--mx]');
        process.exit(1);
    }
    var perms = EmailExtractor.generatePermutations(first, last, dom, {
        middleName: args.flags.middle || '',
        includeUnusual: !!args.flags.unusual
    });
    var permLabel = first + '.' + last + '@' + dom;
    if (!args.flags.mx) {
        writeOutput(perms.join('\n'), args.flags.out, { fmt: 'txt', command: 'permute', label: permLabel, desktop: !!args.flags.desktop });
        return Promise.resolve();
    }
    return validateEmailMx(perms).then(function (mx) {
        var rec = perms.map(function (e) { return { email: e, mxValid: mx.valid.indexOf(e) !== -1 }; });
        var fmt = args.flags.format || 'txt';
        writeOutput(formatOutput(rec.filter(function (r) { return r.mxValid; }), fmt), args.flags.out, { fmt: fmt, command: 'permute', label: permLabel, desktop: !!args.flags.desktop });
    });
}

function cmdMx(args) {
    if (args.pos.length === 0) {
        console.error('usage: paris mx <email> [<email> ...] [--out F] [--format json|csv|txt] [--desktop]');
        process.exit(1);
    }
    var concurrency = args.flags.concurrency != null ? parseInt(args.flags.concurrency, 10) : 8;
    return validateEmailMx(args.pos, concurrency).then(function (mx) {
        var rec = args.pos.map(function (e) { return { email: e, mxValid: mx.valid.indexOf(e) !== -1 }; });
        var fmt = args.flags.format || 'txt';
        // Label the saved file by the first email's domain so a single-domain
        // batch ends up as e.g. "paris-mx-acme.com-2026-…"
        var firstDomain = '';
        if (args.pos[0] && args.pos[0].indexOf('@') !== -1) {
            firstDomain = args.pos[0].split('@')[1];
        }
        var mxLabel = (args.pos.length === 1 ? args.pos[0] : firstDomain) || 'mx';
        if (fmt === 'txt') {
            writeOutput(rec.map(function (r) { return (r.mxValid ? '[ok] ' : '[--] ') + r.email; }).join('\n'), args.flags.out, { fmt: 'txt', command: 'mx', label: mxLabel, desktop: !!args.flags.desktop });
        } else {
            writeOutput(formatOutput(rec, fmt), args.flags.out, { fmt: fmt, command: 'mx', label: mxLabel, desktop: !!args.flags.desktop });
        }
    });
}

function cmdListFootprints(args) {
    var filter = args.pos.join(' ').toLowerCase();
    var rows = BUILTIN_FOOTPRINTS;
    if (filter) rows = rows.filter(function (f) { return String(f.name).toLowerCase().indexOf(filter) !== -1; });
    process.stderr.write(rows.length + ' built-in footprint(s)\n');
    rows.forEach(function (f) { process.stdout.write(f.name + '\n'); });
}

// ── History sub-command ────────────────────────────────────────────────────
// `paris history`           → print stats
// `paris history list`      → list all known emails (txt/json/csv)
// `paris history clear`     → wipe the history file (with --yes confirmation)
// `paris history export FILE` → copy the history JSON to FILE
function cmdHistory(args) {
    var sub = (args.pos[0] || 'stats').toLowerCase();
    var historyOpts = _historyOptsFromArgs(args);
    loadHistory(historyOpts.historyPath);
    var entries = Object.keys(HISTORY_MAP).map(function (k) {
        var v = HISTORY_MAP[k] || {};
        return {
            email: k,
            firstSeen: v.firstSeen || '',
            lastSeen: v.lastSeen || '',
            sourceUrl: v.sourceUrl || '',
            footprint: v.footprint || '',
            command: v.command || ''
        };
    });
    var sinceDay = _isoDay(args.flags.since);
    var untilDay = _isoDay(args.flags.until);
    if (sinceDay || untilDay) {
        entries = entries.filter(function (r) {
            var d = (r.firstSeen || '').slice(0, 10);
            if (!d) return false;
            if (sinceDay && d < sinceDay) return false;
            if (untilDay && d > untilDay) return false;
            return true;
        });
    }

    if (sub === 'stats' || sub === '') {
        process.stdout.write('History file: ' + HISTORY_PATH + '\n');
        process.stdout.write('Total emails: ' + entries.length + '\n');
        if (entries.length) {
            var dates = entries.map(function (r) { return (r.firstSeen || '').slice(0, 10); }).filter(Boolean).sort();
            process.stdout.write('Earliest:    ' + (dates[0] || '?') + '\n');
            process.stdout.write('Latest:      ' + (dates[dates.length - 1] || '?') + '\n');
        }
        return Promise.resolve();
    }
    if (sub === 'list') {
        var fmt = args.flags.format || 'txt';
        var listOpts = { fmt: fmt, command: 'history-list', desktop: !!args.flags.desktop };
        if (fmt === 'json') writeOutput(JSON.stringify(entries, null, 2), args.flags.out, listOpts);
        else if (fmt === 'csv') {
            var lines = ['email,firstSeen,lastSeen,sourceUrl,footprint,command'];
            entries.forEach(function (r) {
                var safe = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
                lines.push([safe(r.email), safe(r.firstSeen), safe(r.lastSeen), safe(r.sourceUrl), safe(r.footprint), safe(r.command)].join(','));
            });
            writeOutput(lines.join('\n'), args.flags.out, listOpts);
        } else {
            writeOutput(entries.map(function (r) { return r.email; }).join('\n'), args.flags.out, listOpts);
        }
        return Promise.resolve();
    }
    if (sub === 'export') {
        var dest = args.pos[1];
        if (!dest) { console.error('usage: paris history export <file>'); process.exit(1); }
        fs.writeFileSync(dest, JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            emails: HISTORY_MAP
        }, null, 2), 'utf8');
        process.stderr.write('Exported ' + entries.length + ' email(s) to ' + dest + '\n');
        return Promise.resolve();
    }
    if (sub === 'clear') {
        if (!args.flags.yes) {
            console.error('Refusing to wipe ' + entries.length + ' email(s) without --yes');
            process.exit(1);
        }
        try {
            if (fs.existsSync(HISTORY_PATH)) fs.unlinkSync(HISTORY_PATH);
            HISTORY_MAP = {};
            HISTORY_DIRTY = false;
            process.stderr.write('History cleared (' + HISTORY_PATH + ')\n');
        } catch (e) {
            console.error('Failed to clear history:', e.message);
            process.exit(1);
        }
        return Promise.resolve();
    }
    console.error('Unknown history sub-command: ' + sub + '. Try: stats | list | export | clear');
    process.exit(1);
}

// ── Help ────────────────────────────────────────────────────────────────────
function help() {
    process.stdout.write([
        'Paris Email Extractor — standalone CLI v' + PARIS_VERSION,
        '',
        'TIP: Run with no arguments (or double-click the .exe) to launch the',
        '     INTERACTIVE MENU — every feature is listed on screen, no need to',
        '     remember commands.',
        '',
        'USAGE',
        '  paris                       Launch interactive menu (recommended)',
        '  paris menu                  Same as above (explicit form)',
        '  paris <command> [options]   Run a single command non-interactively',
        '',
        'COMMANDS',
        '  extract <url|file>          Pull emails from a remote URL or local HTML/text file',
        '  search  "<query>"           Run a DuckDuckGo search and deep-scan results',
        '  footprint "<name-match>"    Run a built-in footprint by name substring',
        '  list-footprints [filter]    List all built-in footprints (1062+ entries)',
        '  permute <first> <last> <d>  Generate corporate email permutations',
        '  mx <email...>               MX-validate one or more email addresses',
        '  history [stats|list|export FILE|clear --yes]',
        '                              Manage the persistent extraction history',
        '  menu | interactive          Launch the interactive menu',
        '',
        'COMMON OPTIONS',
        '  --out <file>            Write to file instead of stdout',
        '  --desktop               Save results to your Desktop with a timestamped filename',
        '  --format json|csv|txt   Output format (default: txt)',
        '  --max-pages N           Search engine pages to crawl (default: 2)',
        '  --concurrency N         Parallel fetch concurrency (default: 6)',
        '  --exclude-isp           Drop ISP/webmail addresses (gmail/yahoo/outlook/…)',
        '                          Default behaviour now KEEPS them; pass this flag to drop.',
        '  --include-isp           (no-op alias kept for back-compat — KEEP is now the default)',
        '  --include-roles         Keep role-based addresses (info@, sales@…)',
        '  --rfc-strict            Allow rare RFC 5322 specials in local part (! # $ % & etc.).',
        '                          Default rejects them — they are almost always regex-noise.',
        '  --min-confidence N      Drop emails below this confidence (default: 0 — keep everything)',
        '  --strict                Shortcut for --min-confidence 30 (the v4.2 default)',
        '  --domain D              Restrict results to a specific domain',
        '  --industry NAME         Append vertical-specific keywords (saas, fintech, healthcare,',
        '                          real-estate, education, manufacturing, marketing, legal,',
        '                          ecommerce, logistics, biotech, energy, hospitality, …)',
        '                          to the query before crawling.',
        '  --country CC            Restrict to a country\'s ccTLD (ISO 3166-1 alpha-2,',
        '                          e.g. US, GB, DE, FR, BR, IN, JP, AE, ZA …)',
        '  --follow-contact        Deep-DB mode: also fetch each result\'s /contact,',
        '                          /about, /team, /people, /staff, /leadership pages',
        '                          (also boosts confidence by +10 for emails found on these pages)',
        '  --mx                    MX-validate every result before output',
        '  --exclude-catchall      With --mx, drop emails on catch-all domains (where the',
        '                          server accepts any address — these are usually low-value).',
        '',
        'HISTORY / DATE OPTIONS  (re-runs never repeat the same emails)',
        '  --no-skip-seen          Disable history filtering for this run',
        '  --since YYYY-MM-DD      Only re-emit emails first seen on/after this day',
        '  --until YYYY-MM-DD      Only re-emit emails first seen on/before this day',
        '  --history PATH          Override history-file location (default:',
        '                          $PARIS_HISTORY or ~/.paris-email-extractor/history.json)',
        '  --after  YYYY-MM-DD     Search-engine `after:` operator — only crawl pages',
        '                          indexed/published on/after this date',
        '  --before YYYY-MM-DD     Search-engine `before:` operator',
        '  --cse <cx>              Use Google Programmable Search Engine instead of',
        '                          DuckDuckGo. See cse/CSE.md for one-time setup.',
        '                          Equivalent: PARIS_CSE_CX env var, or menu option 8.',
        '',
        'EXAMPLES',
        '  paris                                                       # interactive menu',
        '  paris extract https://example.com --follow-contact --desktop',
        '  paris search "site:linkedin.com/in/ \\"@acme.com\\"" --country GB --mx --desktop',
        '  paris search "@acme.com" --cse 0123456789abcdef0:abcdefghijk --desktop',
        '  paris footprint "Apollo.io" --country DE --max-pages 3 --format csv --desktop',
        '  paris footprint "Lead Platform: Facebook Pages" --after 2025-01-01 --desktop',
        '  paris permute Jane Doe acme.com --mx --desktop',
        '  paris mx jane.doe@acme.com info@acme.com --desktop',
        '  paris history stats',
        ''
    ].join('\n'));
}

// ── Interactive menu ────────────────────────────────────────────────────────
// When the program is launched with no arguments (e.g. by double-clicking
// the .exe on Windows) we show a numbered menu so the user never has to
// remember a command. Every feature is reachable from the menu, every
// prompt has a sensible default, and at the end of every action the user
// is offered "Save results to Desktop?" before returning to the main menu.
//
// We build our own line-event reader rather than using rl.question() so
// that it works reliably both on a real TTY (Windows .exe double-click)
// and with piped stdin (smoke tests, scripts).
function _readline() {
    var rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: !!process.stdin.isTTY
    });
    var pending = null;       // resolver awaiting next line
    var buffered = [];        // lines that arrived before a pending resolver
    var closed = false;
    rl.on('line', function (line) {
        if (pending) { var r = pending; pending = null; r(line); }
        else buffered.push(line);
    });
    rl.on('close', function () {
        closed = true;
        if (pending) { var r = pending; pending = null; r(''); }
    });
    return {
        question: function (prompt) {
            process.stdout.write(prompt);
            return new Promise(function (resolve) {
                if (buffered.length) resolve(buffered.shift());
                else if (closed) resolve('');
                else pending = resolve;
            });
        },
        close: function () { rl.close(); }
    };
}

function _ask(rl, question, defaultValue) {
    var prompt = question;
    if (defaultValue !== undefined && defaultValue !== '' && defaultValue !== null) {
        prompt += ' [' + defaultValue + ']';
    }
    prompt += ': ';
    return rl.question(prompt).then(function (ans) {
        ans = String(ans == null ? '' : ans).trim();
        if (ans === '' && defaultValue !== undefined) {
            return String(defaultValue);
        }
        return ans;
    });
}

function _askYesNo(rl, question, defaultYes) {
    var hint = defaultYes ? 'Y/n' : 'y/N';
    return _ask(rl, question + ' [' + hint + ']', '').then(function (ans) {
        if (!ans) return !!defaultYes;
        return /^y(es)?$/i.test(ans.trim());
    });
}

function _printBanner() {
    var line = '═'.repeat(72);
    process.stdout.write([
        '',
        line,
        '  PARIS EMAIL EXTRACTOR  •  v' + PARIS_VERSION + '  •  ' + BUILTIN_FOOTPRINTS.length + ' built-in footprints',
        '  Lead-gen extractor with persistent skip-seen history & deep-DB mode',
        line,
        ''
    ].join('\n'));
}

function _printMenu() {
    process.stdout.write([
        'Choose what to do (type the number, then Enter):',
        '',
        '  1)  Extract emails from a URL or local file',
        '  2)  Search the web for emails (DuckDuckGo)',
        '  3)  Run a built-in footprint  (Facebook, LinkedIn, Apollo, ZoomInfo,',
        '                                 RocketReach, Wellfound, country-targeted, …)',
        '  4)  Browse / list all built-in footprints',
        '  5)  Generate corporate email permutations (first + last + domain)',
        '  6)  MX-validate a list of emails',
        '  7)  Persistent history  (stats / list / export / clear)',
        '  8)  Settings & defaults  (skip-seen, strict mode, default country, save folder)',
        '  9)  Show full feature reference',
        '  0)  Exit',
        ''
    ].join('\n'));
}

// Per-session settings that persist between menu actions.
var INTERACTIVE_SETTINGS = {
    saveToDesktop: true,
    strict: false,
    skipSeen: true,
    country: '',
    followContact: true,
    maxPages: 3,
    minConfidence: null,    // null = use default rule
    saveFolder: '',         // '' = Desktop
    cseCx: process.env.PARIS_CSE_CX || ''  // Google Programmable Search Engine ID; '' = use DuckDuckGo
};

function _commonFlagsFromSettings(extra) {
    var f = {};
    if (INTERACTIVE_SETTINGS.strict) f.strict = true;
    if (INTERACTIVE_SETTINGS.minConfidence != null) f['min-confidence'] = INTERACTIVE_SETTINGS.minConfidence;
    if (INTERACTIVE_SETTINGS.country) f.country = INTERACTIVE_SETTINGS.country;
    if (!INTERACTIVE_SETTINGS.skipSeen) f['no-skip-seen'] = true;
    if (extra) Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
    return f;
}

// Captures the next writeOutput() call so the menu can offer "save to Desktop"
// after the command has finished. We override the global function for the
// duration of one action and restore it afterwards.
function _captureOutput(action) {
    var captured = { text: null, command: null, fmt: 'txt', label: '' };
    var original = writeOutput;
    writeOutput = function (text, outFile, opts) {
        opts = opts || {};
        captured.text = text;
        captured.command = opts.command || captured.command;
        captured.fmt = opts.fmt || captured.fmt;
        if (opts.label) captured.label = opts.label;
        // If the user passed --out / --desktop explicitly, write it now too;
        // otherwise just stash the text so the menu can prompt the user.
        if (outFile || opts.desktop) {
            return original(text, outFile, opts);
        }
        // Echo the result to the screen so the user can see it
        process.stdout.write(text);
        if (!String(text).endsWith('\n')) process.stdout.write('\n');
        return null;
    };
    return Promise.resolve()
        .then(action)
        .then(function (v) { writeOutput = original; return { result: v, captured: captured }; },
              function (e) { writeOutput = original; throw e; });
}

function _afterAction(rl, captured) {
    if (!captured || captured.text == null) return Promise.resolve();
    return _askYesNo(rl, 'Save these results to your Desktop?', INTERACTIVE_SETTINGS.saveToDesktop)
        .then(function (yes) {
            if (!yes) return;
            var folder = INTERACTIVE_SETTINGS.saveFolder || resolveDesktopPath();
            var fname = defaultDesktopFilename(captured.command || 'leads', captured.fmt || 'txt', captured.label);
            var full = path.join(folder, fname);
            try {
                if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
                fs.writeFileSync(full, captured.text, 'utf8');
                process.stdout.write('  ✔ Saved to ' + full + '\n');
            } catch (e) {
                process.stdout.write('  ✗ Failed to save: ' + e.message + '\n');
            }
        });
}

// ── Menu actions ────────────────────────────────────────────────────────────
function _menuExtract(rl) {
    return _ask(rl, 'URL or local file path').then(function (target) {
        if (!target) return;
        return _askYesNo(rl, 'Also crawl /contact, /about, /team sub-pages? (slower, finds more)', INTERACTIVE_SETTINGS.followContact)
            .then(function (followContact) {
                var fmt;
                return _ask(rl, 'Output format (txt/csv/json)', 'csv').then(function (f) {
                    fmt = (f === 'json' || f === 'csv' || f === 'txt') ? f : 'csv';
                    return _captureOutput(function () {
                        var args = { pos: [target], flags: _commonFlagsFromSettings({ format: fmt }) };
                        if (followContact) args.flags['follow-contact'] = true;
                        return cmdExtract(args);
                    });
                }).then(function (out) { return _afterAction(rl, out.captured); });
            });
    });
}

function _menuSearch(rl) {
    return _ask(rl, 'Search query (e.g. \'site:linkedin.com/in/ "@acme.com"\')').then(function (q) {
        if (!q) return;
        return _ask(rl, 'How many search-engine pages to crawl?', String(INTERACTIVE_SETTINGS.maxPages)).then(function (mp) {
            return _askYesNo(rl, 'Also crawl /contact, /about sub-pages of every result?', INTERACTIVE_SETTINGS.followContact)
                .then(function (followContact) {
                    return _askYesNo(rl, 'MX-validate every result before saving?', false).then(function (mx) {
                        return _ask(rl, 'Output format (txt/csv/json)', 'csv').then(function (f) {
                            var fmt = (f === 'json' || f === 'csv' || f === 'txt') ? f : 'csv';
                            return _captureOutput(function () {
                                var args = { pos: [q], flags: _commonFlagsFromSettings({
                                    format: fmt,
                                    'max-pages': parseInt(mp, 10) || INTERACTIVE_SETTINGS.maxPages
                                }) };
                                if (followContact) args.flags['follow-contact'] = true;
                                if (mx) args.flags.mx = true;
                                return cmdSearch(args);
                            }).then(function (out) { return _afterAction(rl, out.captured); });
                        });
                    });
                });
        });
    });
}

function _menuFootprint(rl) {
    return _ask(rl, 'Footprint name to match (e.g. "Facebook", "Apollo", "Country: Germany")')
        .then(function (name) {
            if (!name) return;
            var matches = BUILTIN_FOOTPRINTS.filter(function (f) {
                return String(f.name).toLowerCase().indexOf(name.toLowerCase()) !== -1;
            });
            if (matches.length === 0) {
                process.stdout.write('  No footprint matched "' + name + '". Try option 4 to browse.\n');
                return;
            }
            if (matches.length > 1) {
                process.stdout.write('  Matched ' + matches.length + ' footprint(s):\n');
                matches.slice(0, 20).forEach(function (m, i) {
                    process.stdout.write('    [' + (i + 1) + '] ' + m.name + '\n');
                });
                if (matches.length > 20) process.stdout.write('    … and ' + (matches.length - 20) + ' more (refine your search)\n');
                return _ask(rl, 'Pick number (or Enter to use the first match)', '1').then(function (n) {
                    var idx = parseInt(n, 10) - 1;
                    if (isNaN(idx) || idx < 0 || idx >= Math.min(matches.length, 20)) idx = 0;
                    return _runFootprint(rl, matches[idx]);
                });
            }
            return _runFootprint(rl, matches[0]);
        });
}

function _runFootprint(rl, match) {
    process.stdout.write('  → Selected: ' + match.name + '\n');
    return _ask(rl, 'How many search-engine pages to crawl per query?', String(INTERACTIVE_SETTINGS.maxPages)).then(function (mp) {
        return _askYesNo(rl, 'Also crawl /contact, /about sub-pages?', INTERACTIVE_SETTINGS.followContact).then(function (followContact) {
            return _askYesNo(rl, 'MX-validate every result?', false).then(function (mx) {
                return _ask(rl, 'Output format (txt/csv/json)', 'csv').then(function (f) {
                    var fmt = (f === 'json' || f === 'csv' || f === 'txt') ? f : 'csv';
                    return _captureOutput(function () {
                        var args = { pos: [match.name], flags: _commonFlagsFromSettings({
                            format: fmt,
                            'max-pages': parseInt(mp, 10) || INTERACTIVE_SETTINGS.maxPages
                        }) };
                        if (followContact) args.flags['follow-contact'] = true;
                        if (mx) args.flags.mx = true;
                        return cmdFootprint(args);
                    }).then(function (out) { return _afterAction(rl, out.captured); });
                });
            });
        });
    });
}

function _menuListFootprints(rl) {
    return _ask(rl, 'Filter substring (Enter to list all ' + BUILTIN_FOOTPRINTS.length + ')', '').then(function (filter) {
        var rows = BUILTIN_FOOTPRINTS;
        if (filter) {
            var f = filter.toLowerCase();
            rows = rows.filter(function (r) { return String(r.name).toLowerCase().indexOf(f) !== -1; });
        }
        process.stdout.write('  ' + rows.length + ' footprint(s):\n');
        var pageSize = 30;
        var page = 0;
        function showPage() {
            var slice = rows.slice(page * pageSize, (page + 1) * pageSize);
            slice.forEach(function (r, i) {
                process.stdout.write('    [' + (page * pageSize + i + 1) + '] ' + r.name + '\n');
            });
            var more = (page + 1) * pageSize < rows.length;
            if (!more) return Promise.resolve();
            return _askYesNo(rl, 'Show next ' + pageSize + '?', true).then(function (yes) {
                if (!yes) return;
                page++;
                return showPage();
            });
        }
        return showPage();
    });
}

function _menuPermute(rl) {
    return _ask(rl, 'First name').then(function (first) {
        if (!first) return;
        return _ask(rl, 'Last name').then(function (last) {
            if (!last) return;
            return _ask(rl, 'Domain (e.g. acme.com)').then(function (dom) {
                if (!dom) return;
                return _ask(rl, 'Middle name (optional)', '').then(function (mid) {
                    return _askYesNo(rl, 'Include unusual permutations?', false).then(function (unusual) {
                        return _askYesNo(rl, 'MX-validate and keep only valid?', true).then(function (mx) {
                            return _ask(rl, 'Output format (txt/csv/json)', 'txt').then(function (f) {
                                var fmt = (f === 'json' || f === 'csv' || f === 'txt') ? f : 'txt';
                                return _captureOutput(function () {
                                    var args = { pos: [first, last, dom], flags: { format: fmt } };
                                    if (mid) args.flags.middle = mid;
                                    if (unusual) args.flags.unusual = true;
                                    if (mx) args.flags.mx = true;
                                    return cmdPermute(args);
                                }).then(function (out) { return _afterAction(rl, out.captured); });
                            });
                        });
                    });
                });
            });
        });
    });
}

function _menuMx(rl) {
    return _ask(rl, 'Email(s) to validate (space- or comma-separated)').then(function (line) {
        if (!line) return;
        var emails = line.split(/[\s,]+/).filter(Boolean);
        if (!emails.length) return;
        return _ask(rl, 'Output format (txt/csv/json)', 'txt').then(function (f) {
            var fmt = (f === 'json' || f === 'csv' || f === 'txt') ? f : 'txt';
            return _captureOutput(function () {
                return cmdMx({ pos: emails, flags: { format: fmt } });
            }).then(function (out) { return _afterAction(rl, out.captured); });
        });
    });
}

function _menuHistory(rl) {
    return _ask(rl, 'History action: stats / list / export / clear', 'stats').then(function (sub) {
        sub = (sub || 'stats').toLowerCase();
        if (sub === 'export') {
            return _ask(rl, 'Export to file path').then(function (dest) {
                if (!dest) return;
                return cmdHistory({ pos: ['export', dest], flags: {} });
            });
        }
        if (sub === 'clear') {
            return _askYesNo(rl, 'Wipe ALL persisted email history? This cannot be undone', false).then(function (yes) {
                if (!yes) return;
                return cmdHistory({ pos: ['clear'], flags: { yes: true } });
            });
        }
        if (sub === 'list') {
            return _ask(rl, 'Output format (txt/csv/json)', 'txt').then(function (f) {
                var fmt = (f === 'json' || f === 'csv' || f === 'txt') ? f : 'txt';
                return _captureOutput(function () {
                    return cmdHistory({ pos: ['list'], flags: { format: fmt } });
                }).then(function (out) { return _afterAction(rl, out.captured); });
            });
        }
        return cmdHistory({ pos: ['stats'], flags: {} });
    });
}

function _menuSettings(rl) {
    process.stdout.write('  Current settings:\n');
    process.stdout.write('    saveToDesktop=' + INTERACTIVE_SETTINGS.saveToDesktop + '\n');
    process.stdout.write('    skipSeen=' + INTERACTIVE_SETTINGS.skipSeen + '   (re-runs skip already-extracted emails)\n');
    process.stdout.write('    strict=' + INTERACTIVE_SETTINGS.strict + '   (true = min-confidence 30, false = 0)\n');
    process.stdout.write('    minConfidenceOverride=' + (INTERACTIVE_SETTINGS.minConfidence == null ? '(off)' : INTERACTIVE_SETTINGS.minConfidence) + '\n');
    process.stdout.write('    country=' + (INTERACTIVE_SETTINGS.country || '(off)') + '\n');
    process.stdout.write('    followContact=' + INTERACTIVE_SETTINGS.followContact + '\n');
    process.stdout.write('    maxPages=' + INTERACTIVE_SETTINGS.maxPages + '\n');
    process.stdout.write('    saveFolder=' + (INTERACTIVE_SETTINGS.saveFolder || '(Desktop)') + '\n');
    process.stdout.write('    cseCx=' + (INTERACTIVE_SETTINGS.cseCx ? INTERACTIVE_SETTINGS.cseCx : '(DuckDuckGo)') + '\n');
    return _askYesNo(rl, 'Toggle skip-seen?', false).then(function (yes) {
        if (yes) INTERACTIVE_SETTINGS.skipSeen = !INTERACTIVE_SETTINGS.skipSeen;
    }).then(function () {
        return _askYesNo(rl, 'Toggle strict mode (min-confidence 30)?', false);
    }).then(function (yes) {
        if (yes) INTERACTIVE_SETTINGS.strict = !INTERACTIVE_SETTINGS.strict;
    }).then(function () {
        return _ask(rl, 'Default country code (2 letters, blank to clear)', INTERACTIVE_SETTINGS.country);
    }).then(function (c) {
        INTERACTIVE_SETTINGS.country = String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    }).then(function () {
        return _ask(rl, 'Default max-pages', String(INTERACTIVE_SETTINGS.maxPages));
    }).then(function (mp) {
        var n = parseInt(mp, 10);
        if (n >= 1 && n <= 50) INTERACTIVE_SETTINGS.maxPages = n;
    }).then(function () {
        return _ask(rl, 'Default save folder (blank = Desktop)', INTERACTIVE_SETTINGS.saveFolder || '');
    }).then(function (folder) {
        INTERACTIVE_SETTINGS.saveFolder = folder || '';
    }).then(function () {
        return _ask(rl, 'CSE engine ID (cx) — see cse/CSE.md (blank = DuckDuckGo)', INTERACTIVE_SETTINGS.cseCx || '');
    }).then(function (cx) {
        INTERACTIVE_SETTINGS.cseCx = String(cx || '').trim();
    }).then(function () {
        process.stdout.write('  ✔ Settings updated.\n');
    });
}

function _isPipedInput() {
    return process.stdin && process.stdin.isTTY === false;
}

function _maybePauseBeforeExit() {
    // Windows users who double-click the .exe lose the console window the
    // moment the process exits. Pause for a keypress so they can read the
    // final output. We only do this on a real TTY (so piped scripts and
    // CI runs aren't blocked), and only on Windows.
    if (!process.stdin.isTTY) return Promise.resolve();
    if (process.platform !== 'win32') return Promise.resolve();
    var rl = _readline();
    return rl.question('\nPress Enter to close…').then(function () { rl.close(); });
}

function runInteractive() {
    _printBanner();
    var rl = _readline();
    function loop() {
        _printMenu();
        return _ask(rl, 'Your choice', '1').then(function (choice) {
            choice = String(choice).trim();
            var action;
            switch (choice) {
                case '1': action = _menuExtract(rl); break;
                case '2': action = _menuSearch(rl); break;
                case '3': action = _menuFootprint(rl); break;
                case '4': action = _menuListFootprints(rl); break;
                case '5': action = _menuPermute(rl); break;
                case '6': action = _menuMx(rl); break;
                case '7': action = _menuHistory(rl); break;
                case '8': action = _menuSettings(rl); break;
                case '9': help(); action = Promise.resolve(); break;
                case '0':
                case 'q':
                case 'quit':
                case 'exit':
                    process.stdout.write('\nGoodbye.\n');
                    rl.close();
                    return _maybePauseBeforeExit();
                default:
                    process.stdout.write('  ? Unknown choice "' + choice + '". Type 0 to exit.\n');
                    action = Promise.resolve();
            }
            return Promise.resolve(action)
                .catch(function (err) {
                    process.stdout.write('\n✗ Error: ' + (err && err.message ? err.message : err) + '\n');
                })
                .then(function () {
                    process.stdout.write('\n');
                    return loop();
                });
        });
    }
    return loop();
}


// ── Entrypoint ──────────────────────────────────────────────────────────────
function main() {
    var argv = process.argv.slice(2);
    _installHistorySaveOnExit();

    // No args (or explicit `menu`/`interactive`) → launch the interactive menu.
    // This is what happens when the user double-clicks the .exe on Windows.
    if (argv.length === 0 || argv[0] === 'menu' || argv[0] === 'interactive' || argv[0] === '-i' || argv[0] === '--interactive') {
        Promise.resolve(runInteractive()).then(function () {
            try { saveHistory(); } catch (e) { /* noop */ }
        }).catch(function (err) {
            console.error('Error:', err && err.stack ? err.stack : err);
            try { saveHistory(); } catch (e) { /* noop */ }
            process.exit(1);
        });
        return;
    }

    if (argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
        help();
        return;
    }
    var cmd = argv.shift();
    var args = parseArgs(argv);
    var exec;
    switch (cmd) {
        case 'extract':         exec = cmdExtract(args); break;
        case 'search':          exec = cmdSearch(args); break;
        case 'footprint':       exec = cmdFootprint(args); break;
        case 'list-footprints': cmdListFootprints(args); return;
        case 'permute':         exec = cmdPermute(args); break;
        case 'mx':              exec = cmdMx(args); break;
        case 'history':         exec = cmdHistory(args); break;
        case '--version':
        case 'version':
            process.stdout.write('Paris Email Extractor CLI ' + PARIS_VERSION + '\n');
            return;
        default:
            console.error('Unknown command: ' + cmd);
            help();
            process.exit(1);
    }
    Promise.resolve(exec).catch(function (err) {
        console.error('Error:', err && err.stack ? err.stack : err);
        try { saveHistory(); } catch (e) { /* noop */ }
        process.exit(1);
    });
}

main();
