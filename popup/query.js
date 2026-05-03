
var log = new Log('query');

function storePatterns(str) {
    chrome.storage.local.set({
        patterns: str
    });
}

function storeFootprints(str) {
    chrome.storage.local.set({
        footprints: str
    });
}

function storeLocation(str) {
    chrome.storage.local.set({
        location: str
    })
}

function storeCSEAddress(str) {
    chrome.storage.local.set({
        cse: str
    })
}

// v4.8: Programmable Search Engine cx ID — mirrors CLI's --cse <cx>.
// When set, the background runner builds the SERP URL itself
// (https://cse.google.com/cse?cx=<cx>&q=…) instead of using the legacy
// "CSE Main Address" field. Empty cx falls back to the address field.
function storeCSECx(str) {
    chrome.storage.local.set({
        cseCx: str
    })
}

function storeSecondTerms(str) {
    chrome.storage.local.set({
        secondTerms: str
    })
}

function storeDelay(n) {
    chrome.storage.local.set({
        delay: n
    });
}

function storeRemoveDuplicates(removeDuplicates) {
    chrome.storage.local.set({
        removeDuplicates: removeDuplicates
    });
}

function storeDeepScan(val) {
    chrome.storage.local.set({
        deepScan: val
    });
}

function storeMaxPages(val) {
    chrome.storage.local.set({
        maxPagesPerQuery: val
    });
}

function storeAutoMxValidate(val) {
    chrome.storage.local.set({
        mxValidation: val
    });
}

// ── Skip-seen emails (parity with CLI's --no-skip-seen / history) ─────────
// When the checkbox is on, the runner reads chrome.storage.local.seenEmails
// at the start of every run and drops any email already present. Every
// successful run appends new emails (with firstSeen/lastSeen timestamps)
// to chrome.storage.local.seenEmails so re-runs never re-emit duplicates.
function storeSkipSeenEmails(val) {
    chrome.storage.local.set({ skipSeenEmails: !!val });
}

// v4.9: filter-options parity with CLI (--min-confidence / --include-roles /
// --exclude-isp / --rfc-strict). Stored individually in chrome.storage.local
// and re-applied at run start by background/runner.js (the SW reads the four
// keys at module init and via state:set* messages whenever the popup toggles
// them, mirroring how removeDuplicates/deepScan/mxValidation are wired).
function storeMinConfidence(n) {
    var v = parseInt(n, 10);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 100) v = 100;
    chrome.storage.local.set({ minConfidence: v });
}
function storeExcludeRoles(val) {
    chrome.storage.local.set({ excludeRoles: !!val });
}
function storeExcludeIsp(val) {
    chrome.storage.local.set({ excludeIsp: !!val });
}
function storeRfcStrict(val) {
    chrome.storage.local.set({ rfcStrict: !!val });
}

function restoreSkipSeenEmails() {
    chrome.storage.local.get('skipSeenEmails', function (items) {
        if ($('#skipSeenEmails').length) {
            $('#skipSeenEmails').get(0).checked = !!items.skipSeenEmails;
        }
    });
}

// v4.9: filter-options restore — defaults preserve current extension behaviour
// (minConfidence:30, excludeRoles:true, excludeIsp:true, rfcStrict:false). Note
// the excludeIsp default is intentionally opposite of the CLI default (CLI keeps
// ISP), preserving what extension users see today.
function restoreMinConfidence() {
    chrome.storage.local.get('minConfidence', function (items) {
        if (!$('#minConfidenceInput').length) return;
        var v = items.minConfidence;
        if (typeof v !== 'number' || !isFinite(v) || v < 0) v = 30;
        if (v > 100) v = 100;
        $('#minConfidenceInput').val(v);
    });
}
function restoreExcludeRoles() {
    chrome.storage.local.get('excludeRoles', function (items) {
        if (!$('#excludeRolesCheckbox').length) return;
        var v = (items.excludeRoles === undefined || items.excludeRoles === null)
            ? true
            : !!items.excludeRoles;
        $('#excludeRolesCheckbox').get(0).checked = v;
    });
}
function restoreExcludeIsp() {
    chrome.storage.local.get('excludeIsp', function (items) {
        if (!$('#excludeIspCheckbox').length) return;
        var v = (items.excludeIsp === undefined || items.excludeIsp === null)
            ? true
            : !!items.excludeIsp;
        $('#excludeIspCheckbox').get(0).checked = v;
    });
}
function restoreRfcStrict() {
    chrome.storage.local.get('rfcStrict', function (items) {
        if (!$('#rfcStrictCheckbox').length) return;
        $('#rfcStrictCheckbox').get(0).checked = !!items.rfcStrict;
    });
}

function refreshSeenHistoryCount() {
    if (!$('#seenHistoryCount').length) return;
    chrome.storage.local.get('seenEmails', function (items) {
        var n = (items.seenEmails && typeof items.seenEmails === 'object')
            ? Object.keys(items.seenEmails).length
            : 0;
        $('#seenHistoryCount').text(n + ' email' + (n === 1 ? '' : 's') + ' remembered');
    });
}

function clearSeenHistory() {
    chrome.storage.local.set({ seenEmails: {} }, function () {
        refreshSeenHistoryCount();
    });
}

// ── Country selection ──────────────────────────────────────────────────────
// Maps ISO 3166-1 alpha-2 codes to a list of ccTLDs we'll use to restrict
// queries when the user picks a country and ticks "Restrict to TLD".
// The list mirrors COUNTRY_TLDS in cli/paris.js so behaviour is consistent
// between the extension and the standalone CLI/exe.
var POPUP_COUNTRY_TLDS = {
    US: ['us', 'com'], GB: ['uk', 'co.uk'], CA: ['ca'],
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

function popupCountryFilter(code) {
    if (!code) return null;
    var c = String(code).toUpperCase().replace(/[^A-Z]/g, '');
    var tlds = POPUP_COUNTRY_TLDS[c];
    if (!tlds || !tlds.length) return null;
    if (tlds.length === 1) return 'site:.' + tlds[0];
    return '(' + tlds.map(function (t) { return 'site:.' + t; }).join(' OR ') + ')';
}

function storeCountry(val) {
    chrome.storage.local.set({ country: val || '' });
}

function storeCountryTld(val) {
    chrome.storage.local.set({ countryRestrictTld: !!val });
}

function restoreCountry() {
    chrome.storage.local.get('country', function (items) {
        var val = items.country || '';
        if ($('#country-select').length) {
            $('#country-select').val(val);
        }
    });
}

function restoreCountryTld() {
    chrome.storage.local.get('countryRestrictTld', function (items) {
        // Default ON so picking a country actually narrows results unless
        // the user explicitly opts out.
        var val = (items.countryRestrictTld === undefined || items.countryRestrictTld === null)
            ? true
            : !!items.countryRestrictTld;
        if ($('#country-tld-checkbox').length) {
            $('#country-tld-checkbox').get(0).checked = val;
        }
    });
}

function storeSearchEngine(val) {
    chrome.storage.local.set({
        searchEngine: val
    });
}

function storeLocationExactMatch(exactMatch) {
    chrome.storage.local.set({
        locationExactMatch: exactMatch
    });
}

function storeTerm2ExactMatch(exactMatch) {
    log.i('store term 2', exactMatch);
    chrome.storage.local.set({
        term2ExactMatch: exactMatch
    });
}

function restoreDelay() {
    log.i('before restore : ', $('#delayInput').val());
    chrome.storage.local.get('delay', function (items) {
        log.i('stored : ', items.delay);
        if(((items.delay === undefined) || (items.delay === null))) {
            $('#delayInput').val(10);
            $('#delayInput').change();
            _sendEvent('state:setDelay', {delay: 10000});
        } else {
            $('#delayInput').val(items.delay);
            _sendEvent('state:setDelay', {delay: items.delay * 1000});
        }
    });
}

function restoreRemoveDuplicates() {
    chrome.storage.local.get('removeDuplicates', function (items) {
        if((items.removeDuplicates === null) || (items.removeDuplicates === undefined)) {
            storeRemoveDuplicates(true);
            $('#removeDuplicates').get(0).checked = true;
            _sendEvent('state:setRemoveDuplicates', {value: true});
        } else {
            $('#removeDuplicates').get(0).checked = items.removeDuplicates;
            _sendEvent('state:setRemoveDuplicates', {value: items.removeDuplicates});
        }
    });
}

function restoreLocationExactMatch() {
    chrome.storage.local.get('locationExactMatch', function (items) {
        if((items.locationExactMatch === null) || (items.locationExactMatch === undefined)) {
            storeLocationExactMatch(true);
            $('#location-exact-match-checkbox').get(0).checked = true;
        } else {
            $('#location-exact-match-checkbox').get(0).checked = items.locationExactMatch;   
        }
    });
}

function restoreTerm2ExactMatch() {
    chrome.storage.local.get('term2ExactMatch', function (items) {
        if((items.term2ExactMatch === null) || (items.term2ExactMatch === undefined)) {
            storeTerm2ExactMatch(true);
            $('#term2-exact-match-checkbox').get(0).checked = true;
        } else {
            $('#term2-exact-match-checkbox').get(0).checked = items.term2ExactMatch;   
        }
    });
}

function restoreDeepScan() {
    chrome.storage.local.get('deepScan', function (items) {
        if (items.deepScan === null || items.deepScan === undefined) {
            storeDeepScan(true);
            $('#deepScan').get(0).checked = true;
            _sendEvent('state:setDeepScan', {value: true});
        } else {
            $('#deepScan').get(0).checked = items.deepScan;
            _sendEvent('state:setDeepScan', {value: items.deepScan});
        }
    });
}

function restoreMaxPages() {
    chrome.storage.local.get('maxPagesPerQuery', function (items) {
        if (items.maxPagesPerQuery === null || items.maxPagesPerQuery === undefined) {
            $('#maxPagesInput').val(10);
            storeMaxPages(10);
            _sendEvent('state:setMaxPages', {value: 10});
        } else {
            $('#maxPagesInput').val(items.maxPagesPerQuery);
            _sendEvent('state:setMaxPages', {value: items.maxPagesPerQuery});
        }
    });
}

function restoreAutoMxValidate() {
    chrome.storage.local.get('mxValidation', function (items) {
        var val = (items.mxValidation === true);
        $('#autoMxValidate').get(0).checked = val;
        _sendEvent('state:setMxValidation', {value: val});
    });
}

function restoreSearchEngine() {
    chrome.storage.local.get('searchEngine', function (items) {
        var val = items.searchEngine || 'cse';
        $('#search-engine-select').val(val);
        if (val === 'cse') {
            $('#cse-row').show();
        } else {
            $('#cse-row').hide();
        }
    });
}

function restoreFootprintsFromStorage() {
    chrome.storage.local.get('footprints', function (items) {
        $('#footprint-input').val(items.footprints ? items.footprints : '');
    });
}

function restorePatternsFromStorage() {
    chrome.storage.local.get('patterns', function (items) {
        $('#pattern-input').val(items.patterns ? items.patterns : '');
    });
}

function restoreLocationFromStorage() {
    chrome.storage.local.get('location', function (items) {
        $('#location-input').val(items.location ? items.location : '');
    });
}

function restoreCSEAddressFromStorage() {
    chrome.storage.local.get('cse', function (items) {
        $('#cse-address-input').val(items.cse ? items.cse : '');
    });
}

function restoreCSECxFromStorage() {
    chrome.storage.local.get('cseCx', function (items) {
        $('#cse-cx-input').val(items.cseCx ? items.cseCx : '');
    });
}

function restoreSecondTermsFromStorage() {
    chrome.storage.local.get('secondTerms', function (items) {
        $('#term2-input').val(items.secondTerms ? items.secondTerms : '');
    });
}

function cartesian() {
    var r = [], arg = arguments, max = arg.length-1;
    function helper(arr, i) {
        for (var j = 0, l = arg[i].length; j < l; j++) {
            var a = arr.slice(0);
            a.push(arg[i][j]);
            if(i === max) r.push(a);
            else helper(a, i+1);
        }
    }
    helper([], 0);
    return r;
}

/**
 * Build all query combinations as a cartesian product of the input arrays.
 * @param {string[]} footprints - Site footprint terms
 * @param {string[]} patterns - Email @ pattern terms (e.g. "@gmail.com")
 * @param {string[]} location - Location filter terms
 * @param {string[]} secondTerms - Additional secondary search terms
 * @returns {Array[]} Array of query arrays, one per combination
 */
function buildQueries(footprints, patterns, location, secondTerms) {
    return cartesian(
        (footprints.length ? footprints : [null]),
        (patterns.length ? patterns : [null]),
        (location.length ? location : [null]),
        (secondTerms.length ? secondTerms : [null])
    );
}

function multilineSplit(str) {
    return str.split(/[\n]+/g);
}

function modifyExactMatch(exactMatch, str) {
    if(!str.trim().length) return '';
    if(exactMatch) {
        if(str.match(/"(.*)"/)) return str;
        else return '"'+str+'"';
    } else {
        return str;
    }
}

var EMAIL_PATTERN_CHECK = /^(?:[\s]+)?@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:[\s]+)?$/;

/**
 * Expand a single footprint line containing OR into multiple individual queries.
 * e.g. '"@" CEO OR "chief executive officer"' becomes:
 *   ['"@" CEO', '"@" "chief executive officer"']
 * Lines without OR are returned as-is in a single-element array.
 */
function _expandORTerms(line) {
    var trimmed = line.trim();
    if (!trimmed.length || trimmed.indexOf(' OR ') === -1) {
        return [trimmed];
    }
    // Don't split lines with exclusion operators (e.g. -"@gmail.com")
    // as the exclusions apply to the whole query and would be lost on split parts
    if (trimmed.indexOf(' -"') !== -1) {
        return [trimmed];
    }
    // Detect the "@" prefix (with quotes) so we can prepend it to each split part
    var prefix = '';
    var rest = trimmed;
    var atMatch = trimmed.match(/^"@"\s*/);
    if (atMatch) {
        prefix = atMatch[0];
        rest = trimmed.substring(atMatch[0].length);
    }
    var parts = rest.split(' OR ');
    return parts.map(function (part) {
        return (prefix + part.trim());
    }).filter(function (p) { return p.trim().length > 0; });
}

function getQueries() {
    var locationExactMatch = $('#location-exact-match-checkbox').get(0).checked;
    var term2ExactMatch = $('#term2-exact-match-checkbox').get(0).checked;

    // Country filter — when set, prepend a site:.<tld> filter to every
    // footprint so results are restricted to that country's web. Only
    // applied if the "Restrict to TLD" checkbox is also checked.
    var countryCode = $('#country-select').length ? $('#country-select').val() : '';
    var countryRestrict = $('#country-tld-checkbox').length
        ? $('#country-tld-checkbox').get(0).checked
        : false;
    var countryTldFilter = (countryCode && countryRestrict)
        ? popupCountryFilter(countryCode)
        : null;
    // Build a list of `site:.<tld>` tokens for the selected country so we
    // can detect whether a custom or built-in footprint already pins itself
    // to one of those TLDs and skip prepending in that case (avoids
    // redundant filters like `(site:.us OR site:.com) site:.us "@" foo`).
    var countrySiteTokens = [];
    if (countryCode && countryRestrict) {
        var tlds = POPUP_COUNTRY_TLDS[String(countryCode).toUpperCase()] || [];
        countrySiteTokens = tlds.map(function (t) { return 'site:.' + t; });
    }

    // Expand footprint OR terms into separate queries for maximum coverage
    var footprintLines = $('#footprint-input').val().split(/[\n]+/g)
        .filter(function (s) { return s.trim().length; })
        .reduce(function (acc, line) {
            return acc.concat(_expandORTerms(line));
        }, []);

    if (countryTldFilter) {
        footprintLines = footprintLines.map(function (line) {
            // Skip prepending if the footprint already contains any
            // `site:.<tld>` from the selected country, regardless of where
            // it appears in the line.
            for (var k = 0; k < countrySiteTokens.length; k++) {
                if (line.indexOf(countrySiteTokens[k]) !== -1) return line;
            }
            return countryTldFilter + ' ' + line;
        });
    }

    var queries = buildQueries(
        footprintLines,

        $('#pattern-input').val().split(/[\n]+/g).filter(function (p) {return EMAIL_PATTERN_CHECK.test(p)}).map(function (e) {return '"'+e+'"'}).map(modifyExactMatch.bind(void 0, true)),

        $('#location-input').val().split(/[\n]+/g).filter(function (s) {return s.trim().length}).map(modifyExactMatch.bind(void 0, locationExactMatch)),

        $('#term2-input').val().split(/[\n]+/g).filter(function (s) {return s.trim().length}).map(modifyExactMatch.bind(void 0, term2ExactMatch))
    ).filter(function (query) {
        log.i('filter', query);
        return query.filter(function (s) {return s && s.trim().length}).length;
    });

    var queriesStr = queries.map(function (query) {
        log.i('map', query);
        return query.filter(function (s) {return s && s.trim().length}).join(' ');
    });

    // Deduplicate query strings so no search is ever repeated
    var seen = {};
    var dedupedIdx = [];
    queriesStr.forEach(function (q, i) {
        var key = q.trim().toLowerCase();
        if (!seen[key]) {
            seen[key] = true;
            dedupedIdx.push(i);
        }
    });
    queriesStr = dedupedIdx.map(function (i) { return queriesStr[i]; });
    queries = dedupedIdx.map(function (i) { return queries[i]; });

    var result = {
        str: queriesStr,
        obj: queries
    };
    return result;
}

_onInit(function () {
    
    log.i('before query : ', $('#delayInput').val());
    
    $('#pattern-input').on('change keyup', function () {
        storePatterns($(this).val());
    });
    
    $('#footprint-input').on('change keyup', function () {
        storeFootprints($(this).val());
    });
    
    $('#delayInput').on('input change keyup', function () {
        storeDelay((parseInt($(this).val(), 10)) ? (parseInt($(this).val(), 10)) : 0);
    });
    
    $('#location-input').on('change keyup', function () {
        storeLocation($(this).val());
    });
    
    $('#cse-address-input').on('change keyup', function () {
        storeCSEAddress($(this).val());
    });

    $('#cse-cx-input').on('change keyup', function () {
        storeCSECx($(this).val());
    });
    
    $('#term2-input').on('change keyup', function () {
        storeSecondTerms($(this).val());
    });
    
    $('#removeDuplicates').on('click', function () {
        storeRemoveDuplicates(this.checked);
    });

    $('#deepScan').on('click', function () {
        storeDeepScan(this.checked);
    });

    $('#autoMxValidate').on('click', function () {
        storeAutoMxValidate(this.checked);
        _sendEvent('state:setMxValidation', {value: this.checked});
    });

    if ($('#skipSeenEmails').length) {
        $('#skipSeenEmails').on('click', function () {
            storeSkipSeenEmails(this.checked);
        });
    }
    if ($('#clearSeenBtn').length) {
        $('#clearSeenBtn').on('click', function () {
            if (typeof confirm === 'function' && !confirm('Clear the persistent seen-email history?')) return;
            clearSeenHistory();
        });
    }

    // v4.9: filter-option toggles → mirror to chrome.storage.local AND push to
    // the SW so an in-progress run picks up the new value immediately, exactly
    // like state:setRemoveDuplicates / state:setDeepScan / state:setMxValidation.
    if ($('#minConfidenceInput').length) {
        $('#minConfidenceInput').on('input change keyup', function () {
            var v = parseInt($(this).val(), 10);
            if (!isFinite(v) || v < 0) v = 0;
            if (v > 100) v = 100;
            storeMinConfidence(v);
            _sendEvent('state:setMinConfidence', {value: v});
        });
    }
    if ($('#excludeRolesCheckbox').length) {
        $('#excludeRolesCheckbox').on('click', function () {
            storeExcludeRoles(this.checked);
            _sendEvent('state:setExcludeRoles', {value: this.checked});
        });
    }
    if ($('#excludeIspCheckbox').length) {
        $('#excludeIspCheckbox').on('click', function () {
            storeExcludeIsp(this.checked);
            _sendEvent('state:setExcludeIsp', {value: this.checked});
        });
    }
    if ($('#rfcStrictCheckbox').length) {
        $('#rfcStrictCheckbox').on('click', function () {
            storeRfcStrict(this.checked);
            _sendEvent('state:setRfcStrict', {value: this.checked});
        });
    }

    $('#maxPagesInput').on('input change keyup', function () {
        var val = parseInt($(this).val(), 10);
        if (!val || val < 1) val = 1;
        if (val > 100) val = 100;
        storeMaxPages(val);
        _sendEvent('state:setMaxPages', {value: val});
    });

    $('#search-engine-select').on('change', function () {
        var val = $(this).val();
        storeSearchEngine(val);
        if (val === 'cse') {
            $('#cse-row').show();
        } else {
            $('#cse-row').hide();
        }
    });

    if ($('#country-select').length) {
        $('#country-select').on('change', function () {
            storeCountry($(this).val());
        });
    }
    if ($('#country-tld-checkbox').length) {
        $('#country-tld-checkbox').on('click', function () {
            storeCountryTld(this.checked);
        });
    }
    
    $('#location-exact-match-checkbox').on('click', function () {
        storeLocationExactMatch(this.checked);
    });
    
    $('#term2-exact-match-checkbox').on('click', function () {
        storeTerm2ExactMatch(this.checked);
    });
    
    restorePatternsFromStorage();
    restoreFootprintsFromStorage();
    restoreLocationFromStorage();
    restoreCSEAddressFromStorage();
    restoreCSECxFromStorage();
    restoreSecondTermsFromStorage();
    restoreDelay();
    restoreRemoveDuplicates();
    restoreLocationExactMatch();
    restoreTerm2ExactMatch();
    restoreDeepScan();
    restoreAutoMxValidate();
    restoreSearchEngine();
    restoreMaxPages();
    restoreCountry();
    restoreCountryTld();
    restoreSkipSeenEmails();
    restoreMinConfidence();
    restoreExcludeRoles();
    restoreExcludeIsp();
    restoreRfcStrict();
    refreshSeenHistoryCount();
    
    log.i('after query : ', $('#delayInput').val());
    
});