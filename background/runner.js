
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

// Enhanced email regex with better Unicode support
var _DEEP_EMAIL_REGEXP = /[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/gi;

// Expanded ISP domains list
var _ISP_DOMAINS = {
    'gmail.com':1, 'googlemail.com':1, 'yahoo.com':1, 'ymail.com':1, 'rocketmail.com':1,
    'outlook.com':1, 'hotmail.com':1, 'live.com':1, 'msn.com':1,
    'aol.com':1, 'icloud.com':1, 'me.com':1, 'mac.com':1,
    'protonmail.com':1, 'proton.me':1, 'tutanota.com':1, 'tutanota.de':1,
    'mail.com':1, 'gmx.com':1, 'gmx.de':1, 'gmx.net':1,
    'comcast.net':1, 'xfinity.com':1, 'bellsouth.net':1, 'att.net':1, 'sbcglobal.net':1,
    'verizon.net':1, 'cox.net':1, 'charter.net':1, 'spectrum.net':1, 'centurylink.net':1,
    'frontier.com':1, 'frontiernet.net':1, 'earthlink.net':1, 'windstream.net':1,
    'zoho.com':1, 'zohomail.com':1, 'fastmail.com':1, 'fastmail.fm':1,
    'mail.ru':1, 'yandex.com':1, 'yandex.ru':1, 'inbox.com':1,
    'web.de':1, 'freenet.de':1, 't-online.de':1, 'qq.com':1, '163.com':1, '126.com':1
};

// Enhanced junk email detection
function _isJunkEmail(email) {
    var domain = email.split('@')[1] || '';
    var localPart = email.split('@')[0] || '';
    
    // Role-based emails
    var rolePatterns = /^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|admin|administrator|root|bounce|unsubscribe|abuse|spam)@/i;
    if (rolePatterns.test(email)) return true;
    
    // File extensions
    if (/\.(png|jpg|jpeg|gif|svg|css|js|json|xml|woff|woff2|ttf|eot|mp3|mp4|zip|rar|pdf)$/i.test(email)) return true;
    
    // Test and placeholder domains
    var testDomains = ['example.com', 'example.org', 'test.com', 'localhost', 'sentry.io', 'wixpress.com'];
    if (testDomains.indexOf(domain) !== -1) return true;
    
    // Very short or suspiciously formatted
    if (localPart.length < 2 || domain.length < 4) return true;
    
    return false;
}

// Extract emails from obfuscated formats
function _extractObfuscatedEmails(text) {
    var emails = [];
    var obfuscatedPatterns = [
        /([a-zA-Z0-9._+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+\s*\[dot\]\s*[a-zA-Z]{2,})/gi,
        /([a-zA-Z0-9._+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+\s*\(dot\)\s*[a-zA-Z]{2,})/gi,
        /([a-zA-Z0-9._+-]+)\s+AT\s+([a-zA-Z0-9.-]+\s+DOT\s+[a-zA-Z]{2,})/gi,
        /([a-zA-Z0-9._+-]+)\s+at\s+([a-zA-Z0-9.-]+(?:\s+dot\s+[a-zA-Z0-9-]+)+)/gi
    ];
    
    obfuscatedPatterns.forEach(function(pattern) {
        var match;
        while ((match = pattern.exec(text)) !== null) {
            var email = match[0]
                .replace(/\s*\[at\]\s*/gi, '@')
                .replace(/\s*\(at\)\s*/gi, '@')
                .replace(/\s+AT\s+/gi, '@')
                .replace(/\s+at\s+/gi, '@')
                .replace(/\s*\[dot\]\s*/gi, '.')
                .replace(/\s*\(dot\)\s*/gi, '.')
                .replace(/\s+DOT\s+/gi, '.')
                .replace(/\s+dot\s+/gi, '.')
                .replace(/\s+/g, '')
                .toLowerCase();
            if (email.indexOf('@') > 0 && email.split('@').length === 2) {
                emails.push(email);
            }
        }
    });
    
    return emails;
}

function _deepFetchPage(url, pattern, removeDuplicates) {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 20000); // Increased timeout

    fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (compatible; ParisEmailExtractor/4.0)'
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
        var allEmails = [];
        
        // 1. Extract from mailto: links
        var mailtoRe = /mailto:([a-zA-Z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
        var mailtoMatch;
        while ((mailtoMatch = mailtoRe.exec(html)) !== null) {
            allEmails.push(mailtoMatch[1]);
        }

        // 2. Extract from JSON-LD structured data (enhanced)
        var jsonldRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/\s*script[^>]*>/gi;
        var jsonldMatch;
        while ((jsonldMatch = jsonldRe.exec(html)) !== null) {
            try {
                var jsonText = jsonldMatch[1];
                // Extract emails from JSON
                var jsonEmails = jsonText.match(_DEEP_EMAIL_REGEXP) || [];
                allEmails = allEmails.concat(jsonEmails);
            } catch (e) {
                // Invalid JSON, continue
            }
        }

        // 3. Extract from meta tags (og:email, contact, etc.)
        var metaRe = /<meta[^>]*(?:name|property)\s*=\s*["'](.*?)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
        var metaMatch;
        while ((metaMatch = metaRe.exec(html)) !== null) {
            var metaName = metaMatch[1].toLowerCase();
            var metaContent = metaMatch[2];
            if (metaName.indexOf('email') > -1 || metaName.indexOf('contact') > -1) {
                var metaEmails = metaContent.match(_DEEP_EMAIL_REGEXP) || [];
                allEmails = allEmails.concat(metaEmails);
            }
        }

        // 4. Extract from data attributes (Apollo.io, ZoomInfo style)
        var dataAttrRe = /data-(?:email|contact)[:\s="']+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
        var dataMatch;
        while ((dataMatch = dataAttrRe.exec(html)) !== null) {
            allEmails.push(dataMatch[1]);
        }

        // 5. Extract from LinkedIn profile patterns
        if (url.indexOf('linkedin.com') > -1) {
            var linkedinRe = /(?:email|contact)[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
            var linkedinMatch;
            while ((linkedinMatch = linkedinRe.exec(html)) !== null) {
                allEmails.push(linkedinMatch[1]);
            }
        }

        // 6. Extract obfuscated emails
        var obfuscatedEmails = _extractObfuscatedEmails(html);
        allEmails = allEmails.concat(obfuscatedEmails);

        // 7. Strip HTML and extract from plain text
        var text = html.replace(/<script\b[^>]*>[\s\S]*?<\/\s*script[^>]*>/gi, ' ')
                       .replace(/<style\b[^>]*>[\s\S]*?<\/\s*style[^>]*>/gi, ' ')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/&nbsp;/gi, ' ')
                       .replace(/&quot;/gi, '"')
                       .replace(/&amp;/gi, '&')
                       .replace(/&lt;/gi, '<')
                       .replace(/&gt;/gi, '>');

        var textEmails = text.match(_DEEP_EMAIL_REGEXP) || [];
        allEmails = allEmails.concat(textEmails);

        // Process and filter emails
        var addedNew = false;
        var processed = {};

        allEmails.forEach(function(email) {
            var clean = email.toLowerCase().trim();
            
            // Skip if already processed
            if (processed[clean]) return;
            processed[clean] = true;
            
            // Skip junk emails
            if (_isJunkEmail(clean)) return;

            var domain = clean.split('@')[1];
            if (!domain) return;

            // Apply pattern filter if specified
            if (pattern) {
                var patternClean = pattern.replace(/"/g, '').trim();
                if (patternClean.charAt(0) === '@') patternClean = patternClean.substring(1);
                if (domain !== patternClean) return;
            } else {
                // If no pattern, exclude ISP domains (personal emails)
                if (_ISP_DOMAINS.hasOwnProperty(domain)) return;
            }

            // Add to results if not duplicate
            if (!removeDuplicates || serpdigger.runner.current.emailsFound.indexOf(clean) === -1) {
                serpdigger.runner.current.emailsFound.push(clean);
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
    _notifyPopup('popup:complete', {state: _getRunnerState()});
    serpdigger.runner.current.tab = null;
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