
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

    // Expand footprint OR terms into separate queries for maximum coverage
    var footprintLines = $('#footprint-input').val().split(/[\n]+/g)
        .filter(function (s) { return s.trim().length; })
        .reduce(function (acc, line) {
            return acc.concat(_expandORTerms(line));
        }, []);

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
    
    $('#term2-input').on('change keyup', function () {
        storeSecondTerms($(this).val());
    });
    
    $('#removeDuplicates').on('click', function () {
        storeRemoveDuplicates(this.checked);
    });

    $('#deepScan').on('click', function () {
        storeDeepScan(this.checked);
    });

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
    restoreSecondTermsFromStorage();
    restoreDelay();
    restoreRemoveDuplicates();
    restoreLocationExactMatch();
    restoreTerm2ExactMatch();
    restoreDeepScan();
    restoreSearchEngine();
    restoreMaxPages();
    
    log.i('after query : ', $('#delayInput').val());
    
});