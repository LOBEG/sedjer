var listeners = {};

function _addListener(eventName, callback) {
    listeners[eventName] = callback;
};

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(listeners.hasOwnProperty(request.eventName)) {
        listeners[request.eventName](request.eventData, sender, sendResponse);
        return true;
    };
});

_addListener("account:saved", function (data, sender, respond) {
    serpdigger.account.saved(function(saved) {
        respond(saved);
    });
});

_addListener("account:check", function (data, sender, respond) {
    serpdigger.api.registration.status(data.username, data.password, function (status) {
        respond({paid: status == serpdigger.api.registration.PAID});
    });
});

_addListener("account:save", function (data, sender, respond) {
    serpdigger.account.save(data.username, data.password, function () {
        respond();
    });
});

_addListener("api:footprints", function (data, sender, respond) {
    serpdigger.api.footprints.get(function (footprints) {
        respond(footprints);
    });
});

_addListener("state:get", function (data, sender, respond) {
    respond(_getRunnerState());
});

_addListener("state:start", function (data, sender, respond) {
    serpdigger.run(data.queries);
    respond({ok: true});
});

_addListener("state:stop", function (data, sender, respond) {
    serpdigger.stop();
    respond({ok: true});
});

_addListener("state:download", function (data, sender, respond) {
    serpdigger.download();
    respond({ok: true});
});

_addListener("state:setDelay", function (data, sender, respond) {
    serpdigger.runner.current.delay = data.delay;
    respond({ok: true});
});

_addListener("state:setRemoveDuplicates", function (data, sender, respond) {
    serpdigger.runner.current.removeDuplicates = data.value;
    respond({ok: true});
});

_addListener("state:setPaid", function (data, sender, respond) {
    serpdigger.paid = data.paid;
    respond({ok: true});
});

_addListener("state:setDeepScan", function (data, sender, respond) {
    serpdigger.runner.current.deepScan = data.value;
    respond({ok: true});
});

_addListener("state:setMaxPages", function (data, sender, respond) {
    serpdigger.runner.current.maxPagesPerQuery = data.value;
    respond({ok: true});
});

_addListener("state:setMxValidation", function (data, sender, respond) {
    serpdigger.runner.current.mxValidation = data.value;
    respond({ok: true});
});

// v4.9: filter-options state setters — propagate popup toggles to the SW so
// an in-progress run picks up the new values immediately. Mirrors the existing
// state:setRemoveDuplicates / state:setDeepScan / state:setMxValidation
// pattern. Each handler clamps/sanitises the incoming value defensively.
_addListener("state:setMinConfidence", function (data, sender, respond) {
    var v = parseInt(data && data.value, 10);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 100) v = 100;
    serpdigger.runner.current.minConfidence = v;
    respond({ok: true});
});
_addListener("state:setExcludeRoles", function (data, sender, respond) {
    serpdigger.runner.current.excludeRoles = !!(data && data.value);
    respond({ok: true});
});
_addListener("state:setExcludeIsp", function (data, sender, respond) {
    serpdigger.runner.current.excludeIsp = !!(data && data.value);
    respond({ok: true});
});
_addListener("state:setRfcStrict", function (data, sender, respond) {
    serpdigger.runner.current.rfcStrict = !!(data && data.value);
    respond({ok: true});
});
// v5.0: --follow-contact toggle.
_addListener("state:setFollowContact", function (data, sender, respond) {
    serpdigger.runner.current.followContact = !!(data && data.value);
    respond({ok: true});
});

_addListener("state:validateEmails", function (data, sender, respond) {
    serpdigger.validateEmails(function(results) {
        respond(results);
    });
    return true;
});

_addListener("state:downloadFiltered", function (data, sender, respond) {
    serpdigger.download(data.filterMode);
    respond({ok: true});
});