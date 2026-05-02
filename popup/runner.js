
var log = new Log('popupRunner');

function updateNumberOfEmailsFound(n) {
    $('#collected-emails').text(n);   
}

function updateCurrentQueryNumber(n) {
    $('#current-query').text(n);
}

function updateCurrentQueryString(s) {
    $('#current-query-string').text(s);
}

function showCurrentQueryString() {
    $('#runner-status').show();
}

function hideCurrentQueryString() {
    $('#runner-status').hide();
}

function updateTotalNumberOfQueries(n) {
    $('#total-queries').text(n);
}

function showCompleteStatus() {
    $('#progress-complete-indicator').show();
    $('#progress-running, #progress-stopped-indicator').hide();
}

function hideCompleteStatus() {
    $('#progress-complete-indicator, #progress-stopped-indicator').hide();
    $('#progress-running').show();
}

function showStoppedStatus() {
    $('#progress-stopped-indicator').show();
    $('#progress-complete-indicator, #progress-running').hide();
}

function hideStoppedStatus() {
    $('#progress-stopped-indicator, #progress-complete-indicator').hide();
    $('#progress-running').show();
}

function updateButtonsFromState(state) {
    if(state.running) {
        $('#toggle').text('STOP').data('status', 'stop');
        $('#download').attr('disabled', true);
        $('#mx-validate-btn').attr('disabled', true);
    } else {
        if(state.complete) {
            $('#toggle').text('START').data('status', 'start');
            $('#download').attr('disabled', false);
            if (state.emailCount > 0) {
                $('#mx-validate-btn').attr('disabled', false);
            }
        } else {
            $('#toggle').text('START').data('status', 'start');
            if (state.emailCount > 0) {
                $('#download').attr('disabled', false);
                $('#mx-validate-btn').attr('disabled', false);
            } else {
                $('#download').attr('disabled', true);
                $('#mx-validate-btn').attr('disabled', true);
            }
        }
    }
}

_onInit(function () {
    
    _sendEvent('state:get', {}, function (state) {
        updateNumberOfEmailsFound(state.emailCount);

        var currentQuery = state.totalQueries > 0 ? state.currentQuery + 1 : 0;

        updateCurrentQueryNumber(currentQuery);
        updateTotalNumberOfQueries(state.totalQueries);
        
        if(state.running) {
            showCurrentQueryString();
            updateCurrentQueryString(state.queryString);
        } else {
            hideCurrentQueryString();
        }
        
        state.complete ? showCompleteStatus() : hideCompleteStatus();
        
        updateButtonsFromState(state);
    });
    
    $('#delayInput').on('change keyup input', function () {
        var delay = (parseInt($(this).val(), 10)*1000) ? (parseInt($(this).val(), 10)*1000) : 0;
        _sendEvent('state:setDelay', {delay: delay});
    });
    
    $('#removeDuplicates').change(function () {
        _sendEvent('state:setRemoveDuplicates', {value: this.checked});
    });
    
    $('#deepScan').change(function () {
        _sendEvent('state:setDeepScan', {value: this.checked});
    });
    
    $('#toggle').click(function () {
        log.i('start:', $(this).data('status'));
        if($(this).data('status') === 'stop') {
            showStoppedStatus();
            _sendEvent('state:stop', {});
            $('#download').attr('disabled', false);
        }  else {
            hideStoppedStatus();
            _sendEvent('state:start', {queries: getQueries()});
        }
    });
    
    $('#download').click(function () {
        _sendEvent('state:download', {});
    });

    $('#mx-validate-btn').click(function () {
        var $btn = $(this);
        $btn.attr('disabled', true).text('CHECKING...');
        $('#mx-results-panel').show();
        $('#mx-progress-text').text('Validating domains...');
        $('#mx-valid-count').text('0');
        $('#mx-invalid-count').text('0');
        $('#download-valid').attr('disabled', true);
        $('#download-invalid').attr('disabled', true);

        _sendEvent('state:validateEmails', {}, function (results) {
            if (!results) {
                $btn.attr('disabled', false).text('MX CHECK');
                $('#mx-progress-text').text('Validation failed');
                return;
            }
            $('#mx-valid-count').text(results.validCount);
            $('#mx-invalid-count').text(results.invalidCount);
            $('#mx-progress-text').text('Complete (' + results.total + ' emails checked)');
            $btn.attr('disabled', false).text('MX CHECK');
            if (results.validCount > 0) $('#download-valid').attr('disabled', false);
            if (results.invalidCount > 0) $('#download-invalid').attr('disabled', false);
        });
    });

    $('#download-valid').click(function () {
        _sendEvent('state:downloadFiltered', {filterMode: 'valid'});
    });

    $('#download-invalid').click(function () {
        _sendEvent('state:downloadFiltered', {filterMode: 'invalid'});
    });
    
});