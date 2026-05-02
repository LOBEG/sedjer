
(function() {



var $body = $(document.body);
// Enhanced email extraction using the new EmailExtractor module
var EMAIL_REGEXP = /[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})/gi;
var runner;
var newPage = 2;
var log = new Log('duckduckgo');

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
            var maxPages = runner.options.maxPages || 10;

            if (pagesScanned < maxPages) {
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

    if (isCSE) {
        // Google CSE: extract from full result text (not just snippet)
        $('.gsc-result').each(function () {
            var $this = $(this);
            var allText = $this.text();
            
            // Use enhanced email extractor if available
            if (window.EmailExtractor) {
                var extractedEmails = window.EmailExtractor.extractEmails(allText, platformInfo);
                var emailStrings = extractedEmails.map(function(e) { return e.email; });
                _runner._collectEmails(emailStrings);
            } else {
                // Fallback to regex
                var emails = (allText.match(EMAIL_REGEXP) || []);
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
            var text = $el.text();
            
            // Use enhanced email extractor if available
            if (window.EmailExtractor) {
                var extractedEmails = window.EmailExtractor.extractEmails(text, platformInfo);
                var emailStrings = extractedEmails.map(function(e) { return e.email; });
                _runner._collectEmails(emailStrings);
            } else {
                // Fallback to regex
                var emails = (text.match(EMAIL_REGEXP) || []);
                _runner._collectEmails(emails);
            }

            $el.find('a[href^="http"]').each(function() {
                var href = $(this).attr('href');
                if (href && resultUrls.indexOf(href) === -1) resultUrls.push(href);
            });
        });
        resultUrls = resultUrls.slice(0, 30);
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
