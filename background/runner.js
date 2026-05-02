
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
        mxResults: {}
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
                _deepFetchPage(url, pattern, removeDupes);
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
                maxPages: current.maxPagesPerQuery
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

function _deepFetchPage(url, pattern, removeDuplicates) {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 20000);

    fetch(url, {
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
            isDataPlatform: !!platformInfo.isDataPlatform
        };
        var extracted = EmailExtractor.extractEmails(combinedText, extractorOpts);

        // Apply filtering: minimum confidence, role exclusion, and (if a
        // pattern is supplied) restrict to that domain — otherwise exclude ISP.
        var patternDomain = null;
        if (pattern) {
            patternDomain = pattern.replace(/"/g, '').trim();
            if (patternDomain.charAt(0) === '@') {
                patternDomain = patternDomain.substring(1);
            }
        }

        var filterOpts = {
            minConfidence: 30,
            excludeRoles: true
        };
        if (patternDomain) {
            filterOpts.domainPattern = patternDomain;
        } else {
            filterOpts.excludeISP = true;
        }

        var filtered = EmailExtractor.filterEmails(extracted, filterOpts);
        var unique = EmailExtractor.getUniqueEmails(filtered);

        var addedNew = false;
        unique.forEach(function(email) {
            if (!removeDuplicates || serpdigger.runner.current.emailsFound.indexOf(email) === -1) {
                serpdigger.runner.current.emailsFound.push(email);
                addedNew = true;
            }
        });

        if (addedNew) {
            _notifyPopup('popup:emailCount', {count: serpdigger.runner.current.emailsFound.length});
        }
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

    chrome.storage.local.get(['cse', 'searchEngine'], function (items) {

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
                url = items.cse;
                if (!url) { return }
                url += '&q=' + query + '&ia=web';
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
    serpdigger.runner.current.emailsFound = [];
    serpdigger.runner.current.fetchedUrls = [];
    serpdigger.runner.current.pagesForCurrentQuery = 0;
    serpdigger.runner.current.mxResults = {};

    _notifyPopup('popup:emailCount', {count: 0});
    _notifyPopup('popup:progress', {
        totalQueries: queries.str.length,
        currentQuery: 1,
        queryString: queries.str[0]
    });
    _notifyPopup('popup:started', {state: _getRunnerState()});

    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        if (!tabs || !tabs[0]) {
            log.e('No active tab found');
            _onRunnerStopped();
            return;
        }
        serpdigger.runner.current.tab = tabs[0];
        _nextRunner();
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

    chrome.downloads.download({
        url: 'data:text/plain;base64,' + btoa(emails.join("\r\n")),
        filename: 'paris-email-extractor_'+dateString+'_'+timeString+suffix+'.txt',
        saveAs: true
    });
};