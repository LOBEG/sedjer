
var log = new Log('background');

serpdigger.runner = {
    current: {
        running: false,
        complete: false,
        stopped: false,
        tab: null,
        currentQuery: 0,
        allQueries: [],
        emailsFound: [],
        removeDuplicates: true,
        deepScan: true,
        fetchedUrls: [],
        delay: 5000,
        pagesForCurrentQuery: 0,
        maxPagesPerQuery: 10,
        mxValidation: false,
        mxResults: {},
        // v4.9: filter-options parity with CLI. Defaults preserve current
        // extension behaviour (min-confidence 30, exclude roles, exclude ISP,
        // loose RFC). Overridden at module load by chrome.storage.local and at
        // runtime via state:setMinConfidence / state:setExcludeRoles /
        // state:setExcludeIsp / state:setRfcStrict.
        minConfidence: 30,
        excludeRoles: true,
        excludeIsp: true,
        rfcStrict: false,
        // v5.0: --follow-contact parity. OFF by default (matches CLI flag default).
        followContact: false,
        // v5.0: footprint-name in download filename (CLI v4.5 parity). Set
        // by serpdigger.run() from queries.footprintLabel (resolved popup-side).
        footprintLabel: ''
    } 
};

function _notifyPopup(eventName, data) {
    chrome.runtime.sendMessage(Object.assign({eventName: eventName}, data || {})).catch(function(err) {
        log.w('_notifyPopup: popup not open or message failed for', eventName);
    });
}

function _getRunnerState() {
    return {
        running: serpdigger.runner.current.running,
        complete: serpdigger.runner.current.complete,
        stopped: serpdigger.runner.current.stopped,
        emailCount: serpdigger.runner.current.emailsFound.length,
        currentQuery: serpdigger.runner.current.currentQuery,
        totalQueries: serpdigger.runner.current.allQueries.length,
        queryString: serpdigger.runner.current.allQueries[serpdigger.runner.current.currentQuery] || ''
    };
}

chrome.storage.local.get('delay', function (items) {
    if((items.delay !== undefined) && (items.delay !== null)) {
        serpdigger.runner.current.delay = items.delay * 1000;
    }
})

chrome.storage.local.get('deepScan', function (items) {
    if (items.deepScan !== undefined && items.deepScan !== null) {
        serpdigger.runner.current.deepScan = items.deepScan;
    }
})

chrome.storage.local.get('maxPagesPerQuery', function (items) {
    if (items.maxPagesPerQuery !== undefined && items.maxPagesPerQuery !== null) {
        serpdigger.runner.current.maxPagesPerQuery = items.maxPagesPerQuery;
    }
})

chrome.storage.local.get('mxValidation', function (items) {
    if (items.mxValidation !== undefined && items.mxValidation !== null) {
        serpdigger.runner.current.mxValidation = items.mxValidation;
    }
})

chrome.storage.local.get('removeDuplicates', function (items) {
    if (items.removeDuplicates !== undefined && items.removeDuplicates !== null) {
        serpdigger.runner.current.removeDuplicates = items.removeDuplicates;
    }
})

// v4.9: filter-options load (mirrors the CLI's --min-confidence /
// --include-roles / --exclude-isp / --rfc-strict flags). Each is independently
// storable so the popup can rehydrate after a reload.
chrome.storage.local.get('minConfidence', function (items) {
    if (typeof items.minConfidence === 'number' && isFinite(items.minConfidence) &&
        items.minConfidence >= 0 && items.minConfidence <= 100) {
        serpdigger.runner.current.minConfidence = items.minConfidence;
    }
});
chrome.storage.local.get('excludeRoles', function (items) {
    if (items.excludeRoles !== undefined && items.excludeRoles !== null) {
        serpdigger.runner.current.excludeRoles = !!items.excludeRoles;
    }
});
chrome.storage.local.get('excludeIsp', function (items) {
    if (items.excludeIsp !== undefined && items.excludeIsp !== null) {
        serpdigger.runner.current.excludeIsp = !!items.excludeIsp;
    }
});
chrome.storage.local.get('rfcStrict', function (items) {
    if (items.rfcStrict !== undefined && items.rfcStrict !== null) {
        serpdigger.runner.current.rfcStrict = !!items.rfcStrict;
    }
});

// v5.0: --follow-contact parity. When ON _deepFetchPage queues 14 well-known
// contact-related sub-paths per result host so we pick up emails one click
// away from the SERP-result landing page. Mirrors cli/paris.js#followContactSubpages.
chrome.storage.local.get('followContact', function (items) {
    if (items.followContact !== undefined && items.followContact !== null) {
        serpdigger.runner.current.followContact = !!items.followContact;
    }
});

// ── Deep-scan concurrency ──────────────────────────────────────────────────
// Controls how many _deepFetchPage requests may be in-flight simultaneously.
// Default: 6 (a reasonable balance between throughput and being polite to
// origin servers). 0 / negative / non-numeric ⇒ unlimited (legacy behaviour).
serpdigger.runner.current.deepScanConcurrency = 6;
chrome.storage.local.get('deepScanConcurrency', function (items) {
    var n = items.deepScanConcurrency;
    if (typeof n === 'number' && isFinite(n) && n >= 0) {
        serpdigger.runner.current.deepScanConcurrency = n;
    }
});

var _deepScanInFlight = 0;
var _deepScanQueue = [];

function _drainDeepScanQueue() {
    var limit = serpdigger.runner.current.deepScanConcurrency;
    while (_deepScanQueue.length > 0 &&
           (!limit || limit <= 0 || _deepScanInFlight < limit)) {
        var job = _deepScanQueue.shift();
        _deepScanInFlight++;
        // _deepFetchPage returns a Promise (always — see below).
        Promise.resolve()
            .then(function () { return _deepFetchPage(job.url, job.pattern, job.removeDuplicates); })
            .catch(function () { /* errors are logged inside _deepFetchPage */ })
            .then(function () {
                _deepScanInFlight--;
                _drainDeepScanQueue();
            });
    }
}

function _enqueueDeepFetch(url, pattern, removeDuplicates) {
    _deepScanQueue.push({ url: url, pattern: pattern, removeDuplicates: removeDuplicates });
    _drainDeepScanQueue();
}

// v5.0: --follow-contact parity. After a successful deep-fetch we (optionally)
// fan-out to a small fixed set of well-known contact-related sub-paths on the
// same origin, mirroring cli/paris.js#CONTACT_SUBPATHS. Per-run host de-dup
// (`_followContactSeenHosts`) prevents both N×N fan-out and infinite recursion
// when one of the subpaths itself happens to be a deep-scan target.
var CONTACT_SUBPATHS = [
    '/contact', '/contact-us', '/contact_us',
    '/about', '/about-us', '/about_us',
    '/team', '/our-team', '/people', '/staff',
    '/leadership', '/management', '/directory', '/employees',
    '/impressum'
];

function _maybeQueueContactSubpaths(url, pattern, removeDuplicates) {
    if (!serpdigger.runner.current.followContact) return;
    var origin, pathname;
    try {
        var u = new URL(url);
        origin   = u.origin;
        pathname = u.pathname || '/';
    } catch (e) { return; }
    if (!origin) return;
    // Only fan-out from the *result* page (root or short path). If the URL is
    // already one of our own contact subpaths we skip — avoids recursion.
    var lower = pathname.toLowerCase();
    for (var i = 0; i < CONTACT_SUBPATHS.length; i++) {
        if (lower.indexOf(CONTACT_SUBPATHS[i]) === 0) return;
    }
    if (!serpdigger.runner.current._followContactSeenHosts) {
        serpdigger.runner.current._followContactSeenHosts = {};
    }
    if (serpdigger.runner.current._followContactSeenHosts[origin]) return;
    serpdigger.runner.current._followContactSeenHosts[origin] = true;
    CONTACT_SUBPATHS.forEach(function (p) {
        _enqueueDeepFetch(origin + p, pattern, removeDuplicates);
    });
}

chrome.runtime.onMessage.addListener(
    function (request, sender) {
        log.i('runtime.onMessage', request.eventName, sender);
        if(request.eventName === 'runner:update') {
            request.eventData.emails.forEach(function (email) {
                if(!serpdigger.runner.current.removeDuplicates || serpdigger.runner.current.emailsFound.indexOf(email) === -1) {
                    serpdigger.runner.current.emailsFound.push(email);
                }
            });
            
            _notifyPopup('popup:emailCount', {count: serpdigger.runner.current.emailsFound.length});
        } else if (request.eventName === 'runner:finish') {
            serpdigger.runner.current.pagesForCurrentQuery = 0;
            var delay = (0.5 + Math.random()) * serpdigger.runner.current.delay;
            
            log.w('runtime.onMessage', serpdigger.runner.current.currentQuery);

            var currentQuery = serpdigger.runner.current.currentQuery;
            var allQueries = serpdigger.runner.current.allQueries;

            if(currentQuery + 1 >= allQueries.length) {
                _onRunnerFinish();
                return;
            }

            serpdigger.runner.current.currentQuery++;
            
            setTimeout(_nextRunner, delay);
        } else if (request.eventName === 'download') {
            serpdigger.download();
        } else if (request.eventName === 'runner:deepScan') {
            var urls = request.eventData.urls || [];
            var pattern = request.eventData.pattern || null;
            var removeDupes = request.eventData.removeDuplicates !== false;
            urls.forEach(function(url) {
                if (serpdigger.runner.current.fetchedUrls.indexOf(url) !== -1) return;
                serpdigger.runner.current.fetchedUrls.push(url);
                _enqueueDeepFetch(url, pattern, removeDupes);
            });
        }
    }
)

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    // log.w('onUpdated', tabId, changeInfo, tab);
        
    if(!serpdigger.runner.current.running) return;
    if(!serpdigger.runner.current.tab) return;
    if(tabId != serpdigger.runner.current.tab.id) return;
    // if(changeInfo.status != 'complete') return;

    if (tab.status === 'complete') {
        var current = serpdigger.runner.current;
        current.pagesForCurrentQuery++;
        chrome.tabs.sendMessage(tabId, {
            eventName: 'run',
            eventData: {
                removeDuplicates: current.removeDuplicates,
                delay: current.delay,
                foundEmails: current.emailsFound.length,
                queryNumber: current.currentQuery + 1,
                totalQueries: current.allQueries.length,
                queryString: current.allQueries[current.currentQuery],
                queryObject: current.queries[current.currentQuery],
                deepScan: current.deepScan,
                pagesScanned: current.pagesForCurrentQuery,
                maxPages: current.maxPagesPerQuery,
                // v4.9: filter-options pushed to the content-script SERP path
                // so #search/#b_results/.gsc-result extraction honours the
                // popup's min-confidence / exclude-roles / exclude-ISP /
                // RFC-strict toggles (mirrors CLI _filterOptsFromArgs).
                filterOpts: {
                    minConfidence: current.minConfidence,
                    excludeRoles: !!current.excludeRoles,
                    excludeISP:  !!current.excludeIsp,
                    rfcStrict:   !!current.rfcStrict
                }
            }
        });

        _notifyPopup('popup:progress', {
            totalQueries: serpdigger.runner.current.allQueries.length,
            currentQuery: serpdigger.runner.current.currentQuery + 1,
            queryString: serpdigger.runner.current.allQueries[serpdigger.runner.current.currentQuery]
        });
        _notifyPopup('popup:buttons', {state: _getRunnerState()});
    }
})

// ── Deep Page Scanning (Enhanced) ──────────────────────────────────────────
//
// This now delegates extraction & validation to the shared EmailExtractor module
// (loaded in service-worker.js via importScripts), so deep-scan results use the
// SAME logic as content-script extraction (RFC5322 regex, lenient/obfuscated
// patterns, LinkedIn/Apollo/ZoomInfo platform patterns, ISP/role/disposable
// filtering, and confidence scoring).

// Detect platform from URL (uses EmailExtractor when available, else generic)
function _platformFromUrl(url) {
    if (typeof EmailExtractor !== 'undefined' && EmailExtractor.detectPlatform) {
        return EmailExtractor.detectPlatform(url);
    }
    return { platform: 'generic', isLinkedIn: false, isDataPlatform: false };
}

// Strip hidden elements before email extraction. Mirrors the helper of the
// same name in cli/paris.js — keep the two in sync. See the long comment
// there for the rationale; the short version is:
//   • removes <script>/<style> wholesale (already done below, kept here for
//     comment alignment),
//   • removes HTML comments,
//   • removes elements carrying display:none / visibility:hidden / opacity:0,
//     `hidden`, aria-hidden="true", or screen-reader-only classes
//     (sr-only / visually-hidden / screen-reader-text / etc.).
// This stops anti-bot honeypots from polluting results AND prevents the
// "facebookjohn@x.com" bug where SR-only platform-name spans got glued to
// the email's local-part during tag-stripping.
function _stripHiddenElements(html) {
    if (!html || typeof html !== 'string') return html;
    var out = html.replace(/<!--[\s\S]*?-->/g, ' ');
    var hiddenStyleAttr = '(?:style\\s*=\\s*"[^"]*(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden|opacity\\s*:\\s*0(?![\\d.])|font-size\\s*:\\s*0(?![\\d.]))[^"]*"' +
                           "|style\\s*=\\s*'[^']*(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden|opacity\\s*:\\s*0(?![\\d.])|font-size\\s*:\\s*0(?![\\d.]))[^']*')";
    var hiddenAttrs = '(?:' +
        hiddenStyleAttr + '|' +
        '\\bhidden(?=[\\s>])' + '|' +
        'aria-hidden\\s*=\\s*["\']true["\']' + '|' +
        'class\\s*=\\s*"[^"]*\\b(?:sr-only|visually-hidden|screen-reader-text|u-hidden-visually|hidden-visually|element-invisible|usa-sr-only)\\b[^"]*"' + '|' +
        "class\\s*=\\s*'[^']*\\b(?:sr-only|visually-hidden|screen-reader-text|u-hidden-visually|hidden-visually|element-invisible|usa-sr-only)\\b[^']*'" +
        ')';
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
    out = out.replace(hiddenBlockRe, ' ').replace(hiddenBlockRe, ' ');
    return out;
}

function _deepFetchPage(url, pattern, removeDuplicates) {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 20000);

    return fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (compatible; Paris Email Extractor/4.0)'
        }
    })
    .then(function(response) {
        clearTimeout(timeout);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var ct = (response.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('text/html') === -1 && ct.indexOf('text/plain') === -1 && ct.indexOf('application/xhtml') === -1) {
            throw new Error('Not text content');
        }
        return response.text();
    })
    .then(function(html) {
        if (typeof EmailExtractor === 'undefined') {
            log.w('_deepFetchPage: EmailExtractor not available');
            return;
        }

        // Drop hidden subtrees / honeypots / HTML comments first — see
        // the long comment on _stripHiddenElements above.
        html = _stripHiddenElements(html);

        var platformInfo = _platformFromUrl(url);

        // Build a "scannable text" that preserves mailto links, JSON-LD, meta
        // contents and data attributes — then strip HTML and decode entities so
        // the EmailExtractor sees them as plain text and can apply ALL of its
        // patterns (standard, lenient, obfuscated, LinkedIn, data-platform).
        var preserved = [];

        // mailto: anchors (preserve user@domain so it survives tag stripping)
        var mailtoRe = /mailto:([^"'>\s)]+)/gi;
        var m;
        while ((m = mailtoRe.exec(html)) !== null) {
            preserved.push(m[1]);
            if (m.index === mailtoRe.lastIndex) mailtoRe.lastIndex++;
        }

        // JSON-LD structured data
        var jsonldRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/\s*script[^>]*>/gi;
        while ((m = jsonldRe.exec(html)) !== null) {
            preserved.push(m[1]);
            if (m.index === jsonldRe.lastIndex) jsonldRe.lastIndex++;
        }

        // Meta tags whose name/property mentions email or contact
        var metaRe = /<meta[^>]*(?:name|property)\s*=\s*["']([^"']*)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
        while ((m = metaRe.exec(html)) !== null) {
            var n = m[1].toLowerCase();
            if (n.indexOf('email') > -1 || n.indexOf('contact') > -1) {
                preserved.push(m[2]);
            }
            if (m.index === metaRe.lastIndex) metaRe.lastIndex++;
        }

        // data-email / data-contact attribute values
        var dataAttrRe = /data-(?:email|contact)\s*=\s*["']([^"']+)["']/gi;
        while ((m = dataAttrRe.exec(html)) !== null) {
            preserved.push(m[1]);
            if (m.index === dataAttrRe.lastIndex) dataAttrRe.lastIndex++;
        }

        // Strip script/style/tags and decode common HTML entities.
        // Order matters: decode &amp; LAST to avoid double-unescaping (e.g.
        // raw "&amp;lt;" must NOT become "<").
        var bodyText = html.replace(/<script\b[^>]*>[\s\S]*?<\/\s*script[^>]*>/gi, ' ')
                           .replace(/<style\b[^>]*>[\s\S]*?<\/\s*style[^>]*>/gi, ' ')
                           .replace(/<[^>]+>/g, ' ')
                           .replace(/&nbsp;/gi, ' ')
                           .replace(/&quot;/gi, '"')
                           .replace(/&lt;/gi, '<')
                           .replace(/&gt;/gi, '>')
                           .replace(/&#(\d+);/g, function(_, code) {
                               try { return String.fromCharCode(parseInt(code, 10)); }
                               catch (e) { return ' '; }
                           })
                           .replace(/&amp;/gi, '&');

        var combinedText = preserved.join('\n') + '\n' + bodyText;

        // Run the SAME extraction the content script uses
        var extractorOpts = {
            isLinkedIn: !!platformInfo.isLinkedIn,
            isDataPlatform: !!platformInfo.isDataPlatform,
            // v4.9: thread RFC-strict toggle into validateEmail() so addresses
            // with rare RFC 5322 specials (!#$%&'*/=?^`{|}~) survive when the
            // user opted in via the popup.
            rfcStrict: !!serpdigger.runner.current.rfcStrict
        };
        var extracted = EmailExtractor.extractEmails(combinedText, extractorOpts);

        // ── v4.7: structural extractors ──────────────────────────────────
        // Run the five HTML-aware passes (Cloudflare cfemail, CSS pseudo-
        // elements, RTL-reversed text, fragment reconstruction, <script>
        // bodies) on the ORIGINAL HTML and merge the results. These surface
        // emails the regex-on-stripped-text path cannot see, especially on
        // small-business sites that proxy through Cloudflare.
        if (typeof EmailExtractor.extractFromHtml === 'function') {
            try {
                var structural = EmailExtractor.extractFromHtml(html, extractorOpts);
                var seenForMerge = {};
                for (var ei = 0; ei < extracted.length; ei++) {
                    seenForMerge[extracted[ei].email] = ei;
                }
                for (var si = 0; si < structural.length; si++) {
                    var sr = structural[si];
                    var existing = seenForMerge[sr.email];
                    if (existing === undefined) {
                        extracted.push(sr);
                        seenForMerge[sr.email] = extracted.length - 1;
                    } else if (sr.confidence > extracted[existing].confidence) {
                        // Prefer the higher-confidence record (e.g. Cloudflare
                        // gets +5 and beats a duplicate "lenient" hit).
                        extracted[existing] = sr;
                    }
                }
            } catch (eStr) {
                log.w('_deepFetchPage: structural extraction failed', eStr && eStr.message || eStr);
            }
        }

        // Apply filtering: v4.9 — pull min-confidence / exclude-roles /
        // exclude-isp from serpdigger.runner.current so the popup's filter
        // controls drive behaviour, not hardcoded values. The pattern-domain
        // rule still wins: when a domain pattern is supplied we restrict to it
        // (and ignore the user's excludeIsp toggle for that run, since the
        // domain restriction is strictly stronger).
        var patternDomain = null;
        if (pattern) {
            patternDomain = pattern.replace(/"/g, '').trim();
            if (patternDomain.charAt(0) === '@') {
                patternDomain = patternDomain.substring(1);
            }
        }

        var _cur = serpdigger.runner.current;
        var _minC = (typeof _cur.minConfidence === 'number' && isFinite(_cur.minConfidence) &&
                     _cur.minConfidence >= 0 && _cur.minConfidence <= 100) ? _cur.minConfidence : 30;
        var filterOpts = {
            minConfidence: _minC,
            excludeRoles: !!_cur.excludeRoles,
            rfcStrict: !!_cur.rfcStrict
        };
        if (patternDomain) {
            filterOpts.domainPattern = patternDomain;
        } else if (_cur.excludeIsp !== false) {
            // Default and user-enabled both → drop ISP/webmail. excludeIsp:false
            // explicitly opts out (mirrors CLI's default of keeping ISP).
            filterOpts.excludeISP = true;
        }

        var filtered = EmailExtractor.filterEmails(extracted, filterOpts);
        var unique = EmailExtractor.getUniqueEmails(filtered);

        var addedNew = false;
        unique.forEach(function(email) {
            // Persistent skip-seen: drop emails already known from a prior
            // run when the popup checkbox is enabled. Within-run dedup is
            // still done via the emailsFound check below.
            if (serpdigger.runner.current.skipSeen) {
                var key = String(email).toLowerCase();
                if (serpdigger.runner.current.seenEmails &&
                    serpdigger.runner.current.seenEmails.hasOwnProperty(key)) {
                    return;
                }
            }
            if (!removeDuplicates || serpdigger.runner.current.emailsFound.indexOf(email) === -1) {
                serpdigger.runner.current.emailsFound.push(email);
                addedNew = true;
            }
        });

        if (addedNew) {
            _notifyPopup('popup:emailCount', {count: serpdigger.runner.current.emailsFound.length});
        }
        // v5.0: fan-out to /contact, /about, /team, … on the same origin
        // when --follow-contact (popup checkbox) is ON. Per-host de-dup
        // ensures we only do this once per origin per run.
        _maybeQueueContactSubpaths(url, pattern, removeDuplicates);
    })
    .catch(function(err) {
        clearTimeout(timeout);
        log.w('_deepFetchPage failed for', url, err.message || err);
    });
}

// ── Search Engine Routing ───────────────────────────────────────────────────

function _nextRunner() {
    var currentQuery = serpdigger.runner.current.currentQuery;
    var allQueries = serpdigger.runner.current.allQueries;
    log.i('_nextRunner()', currentQuery, allQueries.length);

    if(serpdigger.runner.current.stopped) {
        return;
    }

    chrome.storage.local.get(['cse', 'cseCx', 'searchEngine'], function (items) {

        var engine = items.searchEngine || 'cse';
        var query = encodeURIComponent(allQueries[currentQuery]);
        var url;

        switch (engine) {
            case 'google':
                url = 'https://www.google.com/search?q=' + query + '&num=100';
                break;
            case 'bing':
                url = 'https://www.bing.com/search?q=' + query + '&count=50';
                break;
            default: // 'cse'
                // v4.8: prefer a CSE cx ID when supplied (parity with CLI's
                // --cse <cx>). When set, build the URL ourselves using the
                // same template as cseSearchUrls() in cli/paris.js. Falls
                // back to the legacy "CSE Main Address" field if no cx.
                var cx = (items.cseCx || '').trim();
                if (cx) {
                    url = 'https://cse.google.com/cse?cx=' + encodeURIComponent(cx) +
                          '&q=' + query + '&ia=web';
                } else {
                    url = items.cse;
                    if (!url) { return; }
                    url += '&q=' + query + '&ia=web';
                }
                break;
        }

        log.i('_nextRunner()', url);

        chrome.tabs.update(serpdigger.runner.current.tab.id, {
            url: url
        });
    });
}

function _onRunnerStopped() {
    log.i('_onRunnerStopped()');
    serpdigger.runner.current.stopped = true;
    serpdigger.runner.current.running = false;
    serpdigger.runner.current.complete = false;
    _notifyPopup('popup:buttons', {state: _getRunnerState()});
    if (serpdigger.runner.current.tab) {
        chrome.tabs.sendMessage(serpdigger.runner.current.tab.id, {
            eventName: 'stopped'
        });
    }
    serpdigger.runner.current.tab = null;
}

function _onRunnerFinish() {
    log.i('_onRunnerFinish()');
    serpdigger.runner.current.running = false;
    serpdigger.runner.current.complete = true;
    serpdigger.runner.current.tab = null;

    // Persist newly-found emails into chrome.storage.local.seenEmails so
    // that the next run can skip them when "Skip emails seen in previous
    // runs" is on. We always update the store (regardless of whether
    // skip-seen was active for this run) so the history grows over time.
    var found = serpdigger.runner.current.emailsFound || [];
    if (found.length > 0) {
        chrome.storage.local.get(['seenEmails'], function (items) {
            var store = (items.seenEmails && typeof items.seenEmails === 'object') ? items.seenEmails : {};
            var nowIso = new Date().toISOString();
            found.forEach(function (email) {
                var key = String(email).toLowerCase();
                if (store[key]) {
                    store[key].lastSeen = nowIso;
                } else {
                    store[key] = { firstSeen: nowIso, lastSeen: nowIso };
                }
            });
            chrome.storage.local.set({ seenEmails: store });
        });
    }

    // Auto-MX validate when enabled and we have results
    if (serpdigger.runner.current.mxValidation
        && serpdigger.runner.current.emailsFound
        && serpdigger.runner.current.emailsFound.length > 0
        && typeof serpdigger.validateEmails === 'function') {

        log.i('_onRunnerFinish: triggering auto MX validation');
        _notifyPopup('popup:complete', {state: _getRunnerState()});
        _notifyPopup('popup:mxAutoStart', {count: serpdigger.runner.current.emailsFound.length});

        serpdigger.validateEmails(function (results) {
            _notifyPopup('popup:mxAutoComplete', {results: results});
        });
    } else {
        _notifyPopup('popup:complete', {state: _getRunnerState()});
    }
};

serpdigger.run = function (queries) {
    log.i('run', queries);

    serpdigger.runner.current.running = true;
    serpdigger.runner.current.complete = false;
    serpdigger.runner.current.stopped = false;
    serpdigger.runner.current.currentQuery = 0;
    serpdigger.runner.current.allQueries = queries.str;
    serpdigger.runner.current.queries = queries.obj;
    // v5.0: persist the footprint label for the download filename builder.
    serpdigger.runner.current.footprintLabel = (queries && typeof queries.footprintLabel === 'string')
        ? queries.footprintLabel : '';
    serpdigger.runner.current.emailsFound = [];
    serpdigger.runner.current.fetchedUrls = [];
    serpdigger.runner.current.pagesForCurrentQuery = 0;
    serpdigger.runner.current.mxResults = {};
    // Persistent skip-seen: if the user enabled "Skip emails seen in
    // previous runs" in the popup, load the persisted email→timestamp
    // map from chrome.storage.local once before the runner starts. The
    // runner reads from current.seenEmails when adding new emails.
    serpdigger.runner.current.seenEmails = {};
    serpdigger.runner.current.skipSeen = false;
    // v5.0: reset per-run host de-dup for --follow-contact fan-out so a
    // fresh run isn't suppressed by a previous run's hosts.
    serpdigger.runner.current._followContactSeenHosts = {};

    _notifyPopup('popup:emailCount', {count: 0});
    _notifyPopup('popup:progress', {
        totalQueries: queries.str.length,
        currentQuery: 1,
        queryString: queries.str[0]
    });
    _notifyPopup('popup:started', {state: _getRunnerState()});

    chrome.storage.local.get(['skipSeenEmails', 'seenEmails'], function (items) {
        serpdigger.runner.current.skipSeen = !!items.skipSeenEmails;
        if (serpdigger.runner.current.skipSeen && items.seenEmails && typeof items.seenEmails === 'object') {
            serpdigger.runner.current.seenEmails = items.seenEmails;
            log.i('skip-seen ON, history loaded with ' + Object.keys(items.seenEmails).length + ' email(s)');
        }
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if (!tabs || !tabs[0]) {
                log.e('No active tab found');
                _onRunnerStopped();
                return;
            }
            serpdigger.runner.current.tab = tabs[0];
            _nextRunner();
        });
    });
};

serpdigger.stop = function () {
    _onRunnerStopped();
};

// ── MX Record Validation ────────────────────────────────────────────────────
// Uses Google DNS-over-HTTPS to look up MX records for email domains.
// Results are cached per domain to avoid redundant lookups.

var _mxCache = {};

function _checkMxRecord(domain) {
    if (_mxCache.hasOwnProperty(domain)) {
        return Promise.resolve(_mxCache[domain]);
    }

    return fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX', {
        headers: { 'Accept': 'application/dns-json' }
    })
    .then(function(response) {
        if (!response.ok) throw new Error('DNS lookup failed');
        return response.json();
    })
    .then(function(data) {
        // Status 0 = NOERROR, Answer array present means MX records exist
        var hasMx = data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
        _mxCache[domain] = hasMx;
        return hasMx;
    })
    .catch(function() {
        // On network error, try Cloudflare DNS as fallback
        return fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=MX', {
            headers: { 'Accept': 'application/dns-json' }
        })
        .then(function(response) {
            if (!response.ok) throw new Error('Fallback DNS lookup failed');
            return response.json();
        })
        .then(function(data) {
            var hasMx = data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
            _mxCache[domain] = hasMx;
            return hasMx;
        })
        .catch(function() {
            // If both DNS providers fail, mark as unknown (treat as valid to not lose data)
            _mxCache[domain] = true;
            return true;
        });
    });
}

serpdigger.validateEmails = function (callback) {
    var emails = serpdigger.runner.current.emailsFound;
    if (!emails || emails.length === 0) {
        callback({ valid: [], invalid: [], total: 0, validCount: 0, invalidCount: 0 });
        return;
    }

    // Group emails by domain to minimize DNS lookups
    var domainMap = {};
    emails.forEach(function(email) {
        var domain = email.split('@')[1];
        if (!domain) return;
        if (!domainMap[domain]) domainMap[domain] = [];
        domainMap[domain].push(email);
    });

    var domains = Object.keys(domainMap);
    var completed = 0;
    var results = { valid: [], invalid: [] };

    if (domains.length === 0) {
        callback({ valid: [], invalid: [], total: 0, validCount: 0, invalidCount: 0 });
        return;
    }

    // Process domains in batches of 5 to avoid overwhelming DNS
    var batchSize = 5;
    var index = 0;

    function processBatch() {
        var batch = domains.slice(index, index + batchSize);
        if (batch.length === 0) {
            serpdigger.runner.current.mxResults = results;
            callback({
                valid: results.valid,
                invalid: results.invalid,
                total: emails.length,
                validCount: results.valid.length,
                invalidCount: results.invalid.length
            });
            return;
        }

        var promises = batch.map(function(domain) {
            return _checkMxRecord(domain).then(function(hasMx) {
                var domainEmails = domainMap[domain];
                if (hasMx) {
                    results.valid = results.valid.concat(domainEmails);
                } else {
                    results.invalid = results.invalid.concat(domainEmails);
                }
                completed++;
                _notifyPopup('popup:mxProgress', {
                    checked: completed,
                    total: domains.length,
                    validCount: results.valid.length,
                    invalidCount: results.invalid.length
                });
            });
        });

        Promise.all(promises).then(function() {
            index += batchSize;
            setTimeout(processBatch, 200);
        });
    }

    processBatch();
};

serpdigger.download = function (filterMode) {
    var date = new Date;
    var dateString = (date.getDate()) + '-' + (date.getMonth()+1) + '-' + (date.getFullYear());
    var timeString = date.getHours() + '-' + date.getMinutes();
    var emails;
    var suffix = '';

    if (filterMode === 'valid' && serpdigger.runner.current.mxResults.valid) {
        emails = serpdigger.runner.current.mxResults.valid;
        suffix = '_valid';
    } else if (filterMode === 'invalid' && serpdigger.runner.current.mxResults.invalid) {
        emails = serpdigger.runner.current.mxResults.invalid;
        suffix = '_invalid';
    } else {
        emails = serpdigger.runner.current.emailsFound;
    }

    // v5.0: footprint-name in filename (CLI v4.5 parity). When the runner
    // started with a non-empty footprint label, build paris-<label>-<ts>.txt;
    // otherwise fall back to the legacy paris-email-extractor_<date>_<time>.txt
    // form so existing user expectations / scripts still work.
    var rawLabel = serpdigger.runner.current.footprintLabel || '';
    var safeLabel = String(rawLabel)
        .toLowerCase()
        .replace(/[^a-z0-9_\-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .slice(0, 32);
    var filename = safeLabel
        ? 'paris-' + safeLabel + '_' + dateString + '_' + timeString + suffix + '.txt'
        : 'paris-email-extractor_' + dateString + '_' + timeString + suffix + '.txt';

    chrome.downloads.download({
        url: 'data:text/plain;base64,' + btoa(emails.join("\r\n")),
        filename: filename,
        saveAs: true
    });
};