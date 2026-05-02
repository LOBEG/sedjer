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
function htmlToScannable(html) {
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
        isDataPlatform: !!platformInfo.isDataPlatform
    });
    var filtered = EmailExtractor.filterEmails(extracted, filterOptions || {
        minConfidence: 30,
        excludeRoles: true,
        excludeISP: true
    });
    return filtered;
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

function writeOutput(text, outFile) {
    if (outFile) {
        fs.writeFileSync(outFile, text, 'utf8');
        process.stderr.write('Wrote ' + outFile + '\n');
    } else {
        process.stdout.write(text);
        if (!text.endsWith('\n')) process.stdout.write('\n');
    }
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

// ── Commands ────────────────────────────────────────────────────────────────
function cmdExtract(args) {
    var target = args.pos[0];
    if (!target) {
        console.error('usage: paris extract <url|file> [--out F] [--format json|csv|txt] [--include-isp] [--include-roles] [--min-confidence N] [--domain D] [--follow-contact]');
        process.exit(1);
    }
    var fmt   = args.flags.format || 'txt';
    var out   = args.flags.out;
    var filterOpts = {
        minConfidence: args.flags['min-confidence'] != null ? parseInt(args.flags['min-confidence'], 10) : 30,
        excludeISP:    !args.flags['include-isp'],
        excludeRoles:  !args.flags['include-roles']
    };
    if (args.flags.domain) filterOpts.domainPattern = String(args.flags.domain).replace(/^@/, '');
    var followContact = !!args.flags['follow-contact'];

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

        // "Deep DB" mode: also fetch /contact, /about, /team, etc.
        if (followContact && page.src) {
            return followContactSubpages(page.src).then(function (pages) {
                pages.forEach(function (p) { ingest(p.html, p.url); });
                process.stderr.write('Found ' + records.length + ' email(s) (incl. ' + pages.length + ' sub-page[s])\n');
                writeOutput(formatOutput(records, fmt), out);
            });
        }
        process.stderr.write('Found ' + records.length + ' email(s)\n');
        writeOutput(formatOutput(records, fmt), out);
    });
}

function cmdSearch(args) {
    var query = args.pos.join(' ');
    if (!query) {
        console.error('usage: paris search "<query>" [--country CC] [--max-pages N] [--concurrency N] [--out F] [--format json|csv|txt] [--include-isp] [--include-roles] [--min-confidence N] [--domain D] [--mx] [--follow-contact]');
        process.exit(1);
    }
    var maxPages    = args.flags['max-pages'] != null ? parseInt(args.flags['max-pages'], 10) : 2;
    var concurrency = args.flags.concurrency != null ? parseInt(args.flags.concurrency, 10) : 6;
    var fmt = args.flags.format || 'txt';
    var out = args.flags.out;
    var filterOpts = {
        minConfidence: args.flags['min-confidence'] != null ? parseInt(args.flags['min-confidence'], 10) : 30,
        excludeISP:    !args.flags['include-isp'],
        excludeRoles:  !args.flags['include-roles']
    };
    if (args.flags.domain) filterOpts.domainPattern = String(args.flags.domain).replace(/^@/, '');
    var followContact = !!args.flags['follow-contact'];

    if (args.flags.country) {
        var f = countryFilter(args.flags.country);
        if (f) {
            query = applyCountryFilter(query, args.flags.country);
            process.stderr.write('Country filter: ' + f + '\n');
        } else {
            process.stderr.write('Warning: unknown country code "' + args.flags.country + '" — ignored\n');
        }
    }

    process.stderr.write('Searching DuckDuckGo for: ' + query + '\n');
    return ddgSearchUrls(query, maxPages).then(function (urls) {
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
        writeOutput(formatOutput(records, fmt), out);
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
    process.stderr.write('Footprint: ' + match.name + '\n');
    // A footprint's value can be multi-line — run each line as its own search.
    var queries = String(match.value).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var allArgs = Object.assign({}, args, { pos: [], flags: args.flags });
    var seen = {};
    var collected = [];
    return queries.reduce(function (chain, q) {
        return chain.then(function () {
            process.stderr.write('-> ' + q + '\n');
            var inner = { pos: [q], flags: Object.assign({}, args.flags, { format: 'json', out: null }) };
            return runSearchInternal(inner).then(function (records) {
                records.forEach(function (r) {
                    if (seen[r.email]) return;
                    seen[r.email] = true;
                    collected.push(r);
                });
            });
        });
    }, Promise.resolve()).then(function () {
        var fmt = args.flags.format || 'txt';
        writeOutput(formatOutput(collected, fmt), args.flags.out);
    });
}

// Like cmdSearch but returns the records array instead of writing.
function runSearchInternal(args) {
    var query = args.pos.join(' ');
    var maxPages    = args.flags['max-pages'] != null ? parseInt(args.flags['max-pages'], 10) : 2;
    var concurrency = args.flags.concurrency != null ? parseInt(args.flags.concurrency, 10) : 6;
    var filterOpts = {
        minConfidence: args.flags['min-confidence'] != null ? parseInt(args.flags['min-confidence'], 10) : 30,
        excludeISP:    !args.flags['include-isp'],
        excludeRoles:  !args.flags['include-roles']
    };
    if (args.flags.domain) filterOpts.domainPattern = String(args.flags.domain).replace(/^@/, '');
    if (args.flags.country) {
        var f = countryFilter(args.flags.country);
        if (f) query = applyCountryFilter(query, args.flags.country);
    }
    var followContact = !!args.flags['follow-contact'];
    return ddgSearchUrls(query, maxPages).then(function (urls) {
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
        }).then(function () { return records; });
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
    if (!args.flags.mx) {
        writeOutput(perms.join('\n'), args.flags.out);
        return Promise.resolve();
    }
    return validateEmailMx(perms).then(function (mx) {
        var rec = perms.map(function (e) { return { email: e, mxValid: mx.valid.indexOf(e) !== -1 }; });
        var fmt = args.flags.format || 'txt';
        writeOutput(formatOutput(rec.filter(function (r) { return r.mxValid; }), fmt), args.flags.out);
    });
}

function cmdMx(args) {
    if (args.pos.length === 0) {
        console.error('usage: paris mx <email> [<email> ...] [--out F] [--format json|csv|txt]');
        process.exit(1);
    }
    var concurrency = args.flags.concurrency != null ? parseInt(args.flags.concurrency, 10) : 8;
    return validateEmailMx(args.pos, concurrency).then(function (mx) {
        var rec = args.pos.map(function (e) { return { email: e, mxValid: mx.valid.indexOf(e) !== -1 }; });
        var fmt = args.flags.format || 'txt';
        if (fmt === 'txt') {
            writeOutput(rec.map(function (r) { return (r.mxValid ? '[ok] ' : '[--] ') + r.email; }).join('\n'), args.flags.out);
        } else {
            writeOutput(formatOutput(rec, fmt), args.flags.out);
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

// ── Help ────────────────────────────────────────────────────────────────────
function help() {
    process.stdout.write([
        'Paris Email Extractor — standalone CLI',
        '',
        'USAGE',
        '  paris <command> [options]',
        '',
        'COMMANDS',
        '  extract <url|file>          Pull emails from a remote URL or local HTML/text file',
        '  search  "<query>"           Run a DuckDuckGo search and deep-scan results',
        '  footprint "<name-match>"    Run a built-in footprint by name substring',
        '  list-footprints [filter]    List all built-in footprints',
        '  permute <first> <last> <d>  Generate corporate email permutations',
        '  mx <email...>               MX-validate one or more email addresses',
        '',
        'COMMON OPTIONS',
        '  --out <file>            Write to file instead of stdout',
        '  --format json|csv|txt   Output format (default: txt)',
        '  --max-pages N           Search engine pages to crawl (default: 2)',
        '  --concurrency N         Parallel fetch concurrency (default: 6)',
        '  --include-isp           Keep ISP/webmail addresses in results',
        '  --include-roles         Keep role-based addresses (info@, sales@…)',
        '  --min-confidence N      Drop emails below this confidence (default: 30)',
        '  --domain D              Restrict results to a specific domain',
        '  --country CC            Restrict to a country\'s ccTLD (ISO 3166-1 alpha-2,',
        '                          e.g. US, GB, DE, FR, BR, IN, JP, AE, ZA …)',
        '  --follow-contact        Deep-DB mode: also fetch each result\'s /contact,',
        '                          /about, /team, /people, /staff, /leadership pages',
        '  --mx                    MX-validate every result before output',
        '',
        'EXAMPLES',
        '  paris extract https://example.com --follow-contact',
        '  paris search "site:linkedin.com/in/ \\"@acme.com\\"" --country GB --mx',
        '  paris footprint "Apollo.io" --country DE --max-pages 3 --format csv --out leads.csv',
        '  paris footprint "Country: Germany"',
        '  paris permute Jane Doe acme.com --mx',
        '  paris mx jane.doe@acme.com info@acme.com',
        ''
    ].join('\n'));
}

// ── Entrypoint ──────────────────────────────────────────────────────────────
function main() {
    var argv = process.argv.slice(2);
    if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
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
        process.exit(1);
    });
}

main();
