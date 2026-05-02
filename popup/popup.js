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
    }
});

$(init);