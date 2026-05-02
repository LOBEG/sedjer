function _sendEvent(name, data, response) {
    chrome.runtime.sendMessage({eventName: name, eventData: data}, response);
}

var initCallbacks = [];

function _onInit(callback) {
    initCallbacks.push(callback);
}

function init() {
    console.log('init');
    
    var manifest = chrome.runtime.getManifest();
    $('#version').html(manifest.version);

    initCallbacks.forEach(function (c) {
        c();
    });
};

chrome.runtime.onMessage.addListener(function (request) {
    if (request.eventName === 'popup:emailCount') {
        updateNumberOfEmailsFound(request.count);
        if (request.count > 0) {
            $('#mx-validate-btn').attr('disabled', false);
        }
    } else if (request.eventName === 'popup:progress') {
        updateTotalNumberOfQueries(request.totalQueries);
        updateCurrentQueryNumber(request.currentQuery);
        updateCurrentQueryString(request.queryString);
    } else if (request.eventName === 'popup:complete') {
        hideCurrentQueryString();
        showCompleteStatus();
        updateButtonsFromState(request.state);
        if (request.state && request.state.emailCount > 0) {
            $('#mx-validate-btn').attr('disabled', false);
        }
    } else if (request.eventName === 'popup:started') {
        showCurrentQueryString();
        hideCompleteStatus();
        updateButtonsFromState(request.state);
        $('#mx-results-panel').hide();
        $('#mx-validate-btn').attr('disabled', true);
    } else if (request.eventName === 'popup:buttons') {
        updateButtonsFromState(request.state);
    } else if (request.eventName === 'popup:mxProgress') {
        $('#mx-valid-count').text(request.validCount);
        $('#mx-invalid-count').text(request.invalidCount);
        $('#mx-progress-text').text('Checking ' + request.checked + '/' + request.total + ' domains...');
    } else if (request.eventName === 'popup:mxAutoStart') {
        // Auto MX validation kicked off by the background runner on completion
        $('#mx-validate-btn').attr('disabled', true).text('CHECKING...');
        $('#mx-results-panel').show();
        $('#mx-progress-text').text('Auto-validating ' + request.count + ' emails...');
        $('#mx-valid-count').text('0');
        $('#mx-invalid-count').text('0');
        $('#download-valid').attr('disabled', true);
        $('#download-invalid').attr('disabled', true);
    } else if (request.eventName === 'popup:mxAutoComplete') {
        var results = request.results || {validCount: 0, invalidCount: 0, total: 0};
        $('#mx-valid-count').text(results.validCount);
        $('#mx-invalid-count').text(results.invalidCount);
        $('#mx-progress-text').text('Complete (' + results.total + ' emails checked)');
        $('#mx-validate-btn').attr('disabled', false).text('MX CHECK');
        if (results.validCount > 0) $('#download-valid').attr('disabled', false);
        if (results.invalidCount > 0) $('#download-invalid').attr('disabled', false);
    }
});

$(init);