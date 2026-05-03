
(function() {



var $body = $(document.body);
// Enhanced email extraction using the new EmailExtractor module
var EMAIL_REGEXP = /[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})/gi;
var runner;
var newPage = 2;
var log = new Log('duckduckgo');

// v5.0: shadow-DOM walker. Many modern marketing widgets (LinkedIn lite
// embeds, Apollo "people" cards, ZoomInfo profile cards) wrap their contact
// blocks in *open* shadow roots, which are invisible to outerHTML on the
// host. We can only see open shadows (closed are inaccessible by design),
// but that already covers most B2B widgets in practice. Returns the
// concatenated innerHTML of every open shadow root reachable from `root`,
// pre-fixed by the host's outerHTML so the standard extractor sees both.
// On any error or when there are zero shadow roots we fall back gracefully
// to plain outerHTML — guaranteeing zero regression for normal SERP pages.
function _collectOuterHtmlWithShadows(root) {
    if (!root) return '';
    var base = '';
    try { base = root.outerHTML || ''; } catch (e) { base = ''; }
    var parts = [base];
    try {
        // Cheap pre-check: avoid the walker entirely on the common case.
        var anyShadow = root.querySelector ? root.querySelector('*') : null;
        if (!anyShadow) return base;
        var stack = [root];
        var visited = 0;
        // Safety cap raised for v5.1 "unlimited" extraction (was 5000).
        // 50,000 covers very large SERP/landing pages while still avoiding
        // pathological infinite descent.
        while (stack.length && visited < 50000) {
            var el = stack.pop();
            visited++;
            if (!el) continue;
            if (el.shadowRoot) {
                try { parts.push(el.shadowRoot.innerHTML || ''); } catch (e) { /* ignore */ }
                // Recurse into the shadow root's own children for nested shadows.
                if (el.shadowRoot.children && el.shadowRoot.children.length) {
                    for (var j = 0; j < el.shadowRoot.children.length; j++) {
                        stack.push(el.shadowRoot.children[j]);
                    }
                }
            }
            if (el.children && el.children.length) {
                for (var i = 0; i < el.children.length; i++) {
                    stack.push(el.children[i]);
                }
            }
        }
    } catch (e) { /* shadow traversal best-effort */ }
    return parts.length > 1 ? parts.join('\n') : base;
}

// v5.1: live-DOM augmentation. Reads runtime values from getComputedStyle
// for ::before/::after pseudo-elements (where many sites stash contact
// emails via CSS `content:` declarations) AND collects innerHTML from any
// reachable same-origin iframes. Both are appended to the rawHtml so the
// shared EmailExtractor pipeline picks them up via its existing structural
// passes. All operations are wrapped in try/catch — same-origin checks
// throw on cross-origin frames and we silently skip those.
//
// Returns a string of extra HTML/text fragments, separated by newlines.
// On any error returns ''. Designed to be additive: callers concatenate
// the result onto the existing outerHTML/shadow output.
function _collectLiveDomExtras(root) {
    if (!root || !root.querySelectorAll) return '';
    var extras = [];
    var visited = 0;
    var MAX_VISITS = 20000;

    // 1) Walk same-origin iframes. iframe.contentDocument throws or returns
    // null on cross-origin per the same-origin policy; we catch and skip.
    try {
        var iframes = root.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length && visited < MAX_VISITS; i++) {
            var ifr = iframes[i];
            visited++;
            try {
                var doc = ifr.contentDocument;
                if (doc && doc.body) {
                    extras.push(doc.body.outerHTML || doc.body.innerHTML || '');
                    // Recurse one level for nested iframes.
                    var nested = doc.querySelectorAll ? doc.querySelectorAll('iframe') : [];
                    for (var k = 0; k < nested.length && visited < MAX_VISITS; k++) {
                        visited++;
                        try {
                            var ndoc = nested[k].contentDocument;
                            if (ndoc && ndoc.body) {
                                extras.push(ndoc.body.outerHTML || ndoc.body.innerHTML || '');
                            }
                        } catch (e) { /* cross-origin */ }
                    }
                }
            } catch (e) { /* cross-origin iframe */ }
        }
    } catch (e) { /* querySelectorAll failed */ }

    // 2) Read getComputedStyle(...).content for ::before / ::after on every
    // element. The `content` value comes back as a quoted string ("...") or
    // 'none' / 'normal'. We unquote and append the text — the EmailExtractor
    // regex pass will pick out any emails. We cap visits to MAX_VISITS so
    // pathological pages don't freeze the tab.
    try {
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            var all = root.querySelectorAll('*');
            var pseudos = ['::before', '::after'];
            for (var n = 0; n < all.length && visited < MAX_VISITS; n++) {
                var el = all[n];
                visited++;
                for (var p = 0; p < pseudos.length; p++) {
                    var content;
                    try { content = window.getComputedStyle(el, pseudos[p]).getPropertyValue('content'); }
                    catch (e) { content = ''; }
                    if (!content || content === 'none' || content === 'normal') continue;
                    // Strip surrounding single/double quotes and unescape \xx
                    // sequences as much as we reasonably can.
                    var unq = content.replace(/^['"]|['"]$/g, '');
                    // CSS escape: "\\hh" hex codes — turn back into characters.
                    unq = unq.replace(/\\([0-9a-fA-F]{1,6})\s?/g, function (_, hex) {
                        try { return String.fromCharCode(parseInt(hex, 16)); }
                        catch (er) { return ''; }
                    });
                    if (unq.indexOf('@') > -1) extras.push(unq);
                }
            }
        }
    } catch (e) { /* getComputedStyle failed */ }

    return extras.length ? ('\n<!--paris-live-dom-->\n' + extras.join('\n')) : '';
}

function Runner(options) {
    log.i('Runner/init');
    this.options = options;
    this.lastId = -1;
    this.emails = [];
    this.stopped = true;
}

Runner.prototype.setOptions = function (options) {
    log.i('Runner/setOptions', options);
    this.options = options;
};

Runner.prototype.run = function (callback) {
    log.i('Runner/run', callback);
    
    this.stopped = false;
    this.emails = [];
    
    callback = callback || function () {};
    this.start(callback);
};

Runner.prototype.start = function (originalCallback) {
    log.i('Runner/start');
    
    var _runner = this;
    var callback = function () {
        log.i('Finished');
        _runner._finish();
        originalCallback.apply(undefined, arguments);
    };
    
    window.scrollTo(0, 0);
    
    function nextPage(callback) {
        log.i('Runner/start/nextPage');
        if(_runner.stopped) {
            log.i('Stopped');
            callback(false);
            return;
        }

        // Non-CSE pages: extract then navigate to next page of results
        if ($('.gsc-result').length === 0 && $('.gsc-webResult').length === 0) {
            log.i('Runner/start/nextPage/non-CSE page');
            _runner._update();

            var pagesScanned = runner.options.pagesScanned || 1;
            var maxPages = runner.options.maxPages;
            // v5.1: 0 / unset / negative ⇒ UNLIMITED page count. Treat
            // any positive integer as a hard cap; otherwise loop forever
            // (until the SERP engine stops returning a "next" link below).
            var unlimited = !(maxPages > 0);

            if (unlimited || pagesScanned < maxPages) {
                var $nextLink = null;

                // Google Web Search: "Next" pagination link
                if ($('#pnnext').length > 0) {
                    $nextLink = $('#pnnext');
                } else if ($('a[aria-label="Next"]').length > 0) {
                    $nextLink = $('a[aria-label="Next"]');
                }
                // Bing: next page link
                else if ($('a.sb_pagN').length > 0) {
                    $nextLink = $('a.sb_pagN');
                } else if ($('.sb_pagN_bp').length > 0) {
                    $nextLink = $('.sb_pagN_bp');
                }

                if ($nextLink && $nextLink.length > 0) {
                    log.i('Runner/start/nextPage/non-CSE navigating to page', pagesScanned + 1);
                    setTimeout(function() {
                        $nextLink[0].click();
                    }, 1500);
                    return;
                }
            }

            log.i('Runner/start/nextPage/non-CSE finish (no more pages or limit reached)');
            _runner._finish();
            return;
        }

        var isNoResults = $('.gsc-result .gs-no-results-result').length > 0;

        if(isNoResults) {
            log.i('Runner/start/nextPage/Finished');
            _runner._update();
            _runner._finish();
            // callback(true);
            return;
        }

        var currentPage = $('.gsc-cursor .gsc-cursor-page.gsc-cursor-current-page');

        if (currentPage.is(':last-child')) {
            log.w('Runner/start/nextPage/last page', currentPage.text());
            _runner._update();
            _runner._finish();
        } else {
            log.w('Runner/start/nextPage/next page', currentPage.text(), currentPage.next().text());
            _runner._update();
            
            setTimeout(function() {
                if (!$('.gsc-webResult').hasClass('gsc-loading-resultsRoot')) {
                    currentPage.next().click();

                    var newPageLoadingInterval = setInterval(function() {
                        if (!$('.gsc-webResult').hasClass('gsc-loading-resultsRoot')) {
                            clearInterval(newPageLoadingInterval);
                            helper(callback);
                        }
                    }, 1000);
                }
            }, 1000);
        }
    }
    
    function helper(callback) {
        log.i('Runner/start/helper');

        if (runner.stopped) { return }

        var timeout = runner.emails.length * 1.25;
        
        if (timeout < 1500) {
            timeout = 1500;
        }

        setTimeout(function() {
            log.i('Runner/start/helper/scroll');
            window.scrollTo(0, document.body.scrollHeight);

            _runner.extract();

            nextPage(function (finished) {
                log.i('Runner/start/helper/nextPage', finished);

                if(finished === true) {
                    callback();
                } else if (finished === false) {
                    callback();
                }
            });
        }, timeout);
    }
    
    helper(callback);
}

// Runner.prototype.waitForLoadFinish = function (callback) {
//     log.i('Runner/waitForLoadFinish');
    
//     function i() {
//         var results = document.getElementsByClassName('gsc-result').length;
//         var noResults = document.getElementsByClassName('gs-no-results-result').length;

//         log.i('Runner/waitForLoadFinish/i', results, noResults);
        
//         clearInterval(interval);
//         if(noResults) {
//             callback();
//         } else if (results) {
//             callback();
//         }
//     }
//     var interval = setInterval(i, 1000);
//     i();
// }

Runner.prototype.stop = function () {
    log.i('Runner/stop');
    this.stopped = true;
};

Runner.prototype.extract = function () {
    var _runner = this;
    log.i('Runner/extract', runner);

    var resultUrls = [];
    var isCSE = $('.gsc-result').length > 0;
    
    // Detect platform for enhanced extraction
    var platformInfo = window.EmailExtractor ? window.EmailExtractor.detectPlatform(window.location.href) : { platform: 'generic' };

    // v4.9: pull popup-controlled filter options from the runner config (see
    // background/runner.js eventData.filterOpts). Defaults preserve legacy
    // extension behaviour (minConfidence:30, excludeRoles:true).
    var optsFromBg = (this.options && this.options.filterOpts) || {};
    var serpFilterOpts = {
        minConfidence: (typeof optsFromBg.minConfidence === 'number') ? optsFromBg.minConfidence : 30,
        excludeRoles: (optsFromBg.excludeRoles !== undefined) ? !!optsFromBg.excludeRoles : true
    };
    if (optsFromBg.excludeISP) serpFilterOpts.excludeISP = true;
    if (optsFromBg.rfcStrict)  serpFilterOpts.rfcStrict  = true;
    // extractEmails / extractFromHtml read rfcStrict via validateEmail.
    var extractorOpts = Object.assign({}, platformInfo, {
        rfcStrict: !!optsFromBg.rfcStrict
    });

    if (isCSE) {
        // Google CSE: extract from full result text (not just snippet)
        $('.gsc-result').each(function () {
            var $this = $(this);
            var elNode = this;

            // Use enhanced email extractor if available
            if (window.EmailExtractor) {
                // v4.7+: prefer the HTML-aware pipeline so Cloudflare cfemail
                // blobs, CSS ::before/::after content, RTL-reversed text,
                // split-span fragments and <script> bodies on the SERP card
                // itself are caught. Fall back to text-only extraction on
                // older builds where extractFromHtml isn't exported.
                // v5.1: append live-DOM extras (computed-style ::before /
                // ::after content + same-origin iframe bodies) so emails
                // injected at runtime are also picked up.
                var rawHtml = _collectOuterHtmlWithShadows(elNode);
                var liveExtras = _collectLiveDomExtras(elNode);
                if (liveExtras) rawHtml = rawHtml + liveExtras;
                var extractedEmails;
                if (typeof window.EmailExtractor.extractEmailsWithContext === 'function' && rawHtml) {
                    extractedEmails = window.EmailExtractor.extractEmailsWithContext(rawHtml, extractorOpts);
                } else if (typeof window.EmailExtractor.extractFromHtml === 'function' && rawHtml) {
                    extractedEmails = window.EmailExtractor.extractFromHtml(rawHtml, extractorOpts);
                } else {
                    extractedEmails = window.EmailExtractor.extractEmails($this.text(), extractorOpts);
                }
                // Apply confidence threshold and dedupe via the module
                var filtered = window.EmailExtractor.filterEmails(extractedEmails, serpFilterOpts);
                _runner._collectRecords(filtered);
            } else {
                // Fallback to regex
                var emails = ($this.text().match(EMAIL_REGEXP) || []);
                _runner._collectEmails(emails);
            }

            // Collect result link URLs for deep page scanning
            $this.find('a.gs-title, a[data-ctorig]').each(function() {
                var href = $(this).data('ctorig') || $(this).attr('href');
                if (href && href.indexOf('http') === 0 && resultUrls.indexOf(href) === -1) {
                    resultUrls.push(href);
                }
            });
        });
    } else {
        // Google / Bing / generic page: extract from result containers or body
        var $containers;
        if ($('#search .g').length > 0) {
            $containers = $('#search .g');
        } else if ($('#b_results .b_algo').length > 0) {
            $containers = $('#b_results .b_algo');
        } else {
            $containers = $('body');
        }

        $containers.each(function () {
            var $el = $(this);
            var elNode = this;

            // Use enhanced email extractor if available
            if (window.EmailExtractor) {
                // v4.7+: HTML-aware path — see the matching CSE branch above.
                var rawHtml = _collectOuterHtmlWithShadows(elNode);
                var liveExtras = _collectLiveDomExtras(elNode);
                if (liveExtras) rawHtml = rawHtml + liveExtras;
                var extractedEmails;
                if (typeof window.EmailExtractor.extractEmailsWithContext === 'function' && rawHtml) {
                    extractedEmails = window.EmailExtractor.extractEmailsWithContext(rawHtml, extractorOpts);
                } else if (typeof window.EmailExtractor.extractFromHtml === 'function' && rawHtml) {
                    extractedEmails = window.EmailExtractor.extractFromHtml(rawHtml, extractorOpts);
                } else {
                    extractedEmails = window.EmailExtractor.extractEmails($el.text(), extractorOpts);
                }
                var filtered = window.EmailExtractor.filterEmails(extractedEmails, serpFilterOpts);
                _runner._collectRecords(filtered);
            } else {
                // Fallback to regex
                var emails = ($el.text().match(EMAIL_REGEXP) || []);
                _runner._collectEmails(emails);
            }

            $el.find('a[href^="http"]').each(function() {
                var href = $(this).attr('href');
                if (href && resultUrls.indexOf(href) === -1) resultUrls.push(href);
            });
        });
        // v5.1: removed the historical .slice(0, 30) cap to enable "unlimited"
        // deep-scan fan-out. resultUrls is bounded in practice by what the
        // SERP page renders, and the deep-scan queue itself is throttled by
        // serpdigger.runner.current.deepScanConcurrency.
    }

    // Send result URLs for deep scanning in background
    if (resultUrls.length > 0 && runner.options.deepScan !== false) {
        chrome.runtime.sendMessage({
            eventName: 'runner:deepScan',
            eventData: {
                urls: resultUrls,
                pattern: runner.options.queryObject ? runner.options.queryObject[1] : null,
                removeDuplicates: runner.options.removeDuplicates
            }
        });
    }
};

// v5.1: rich-record collector. Accepts an array of {email, name?, confidence?}
// objects from the EmailExtractor and dedupes by email. The legacy
// _collectEmails path (string[]) is preserved below for the regex-fallback
// branch that runs when EmailExtractor isn't available.
Runner.prototype._collectRecords = function (records) {
    if (!records || !records.length) return;
    var pattern = (runner.options && runner.options.queryObject) ? runner.options.queryObject[1] : null;
    var patternBare = pattern ? pattern.replace(/"/g, '') : null;

    records.forEach(function (rec) {
        if (!rec || !rec.email) return;
        var email = String(rec.email).toLowerCase().replace(/\s{1,}/gi, '');
        var keep = email;

        // Pattern restriction (legacy behaviour from _collectEmails): when
        // the user specified a domain pattern (e.g. "@acme.com"), only keep
        // emails ending with it AND strip the local-part prefix to align
        // with the legacy collected-emails shape.
        if (patternBare) {
            var split = email.split(patternBare);
            if (split[0].search('@') > -1) return;
            keep = split[0] + patternBare;
        }

        // Dedup by email key.
        var dup = false;
        for (var i = 0; i < runner.emails.length; i++) {
            var ex = runner.emails[i];
            var exKey = (typeof ex === 'string') ? ex : (ex.email || '');
            if (exKey === keep) { dup = true; break; }
        }
        if (!runner.options.removeDuplicates || !dup) {
            runner.emails.push({
                email: keep,
                name: rec.name || '',
                confidence: typeof rec.confidence === 'number' ? rec.confidence : 0
            });
        }
    });
};

Runner.prototype._collectEmails = function(emails) {
    emails.forEach(function (email) {
        var emailParsed = email.toLowerCase().replace(/\s{1,}/gi, '');

        if (!runner.options.queryObject || !runner.options.queryObject[1]) {
            if(!runner.options.removeDuplicates || (runner.emails.indexOf(emailParsed) === -1)) {
                runner.emails.push(emailParsed);
            }
            return;
        }
        var emailObject = runner.options.queryObject[1].replace(/"/g, '');
        var emailResult = emailParsed.split(emailObject);

        if (emailResult[0].search('@') > -1) { return }

        emailResult = emailResult[0] + emailObject;

        if(!runner.options.removeDuplicates || (runner.emails.indexOf(emailResult) === -1)) {
            runner.emails.push(emailResult);
        }
    });
};

Runner.prototype._start = function () {
    log.i('Runner/_start');
};

Runner.prototype._finish = function () {
    log.i('Runner/_finish', runner.emails);

    chrome.runtime.sendMessage({
        eventName: 'runner:finish',
        eventData: {
            emails: runner.emails
        }
    });
};

Runner.prototype._update = function () {
    log.i('Runner/_update', runner.emails.length);
    
    chrome.runtime.sendMessage({
        eventName: 'runner:update',
        eventData: {
            emails: runner.emails
        }
    })
};

runner = runner || new Runner();

chrome.runtime.onMessage.addListener(function (request, sender) {
    log.i('runtime.onMessage', request, sender);
    
    if(request.eventName === 'run') {
        runner.setOptions(request.eventData);
        runner.run();
    } else if (request.eventName === 'stopped') {
        runner.stop();
    }
});

})()
