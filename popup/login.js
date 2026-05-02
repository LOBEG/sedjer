var PAID = false;

function updatePaidStatus(paid) {
    PAID = paid;
    _sendEvent('state:setPaid', {paid: paid});
}

function updateAccountStatus(username, password, callback) {
    $('#checking-account').show();
    if(username && password) {
        $('.activated,.trial').hide();
        _sendEvent("account:check", {
            username: username,
            password: password
        }, function (data) {
           
                updatePaidStatus(data.paid);
                $('.trial, #checking-account').hide();
                if (data.paid) {
                    $('.activated').show();
                } else {
                    $('.trial').show();
                }
             
            callback();
        });
    } else {
        _sendEvent('account:saved', {}, function (account) {
            if (!account) {
                $('#checking-account').hide();
                callback();
                return;
            }
                   _sendEvent("account:check", {
                    username: account.username,
                    password: account.password
                }, function (data) {
                         updatePaidStatus(data.paid);
                        $('.trial, #checking-account').hide();
                        if (data.paid) {
                            $('.activated').show();
                        } else {
                            $('.trial').show();
                        }
                   
                    callback();
                });
        });
    }
}

function login (username, password, remember, callback) {
    $('#login').attr('disabled', true);
    updateAccountStatus(username, password, function () {
        if(remember) {
            _sendEvent("account:save", {
                username: username,
                password: password
            }, function () {
                callback();
            });
        } else {
            callback();
        }   
        $('#login').attr('disabled', false);
        $('#login-modal').modal('hide');
    });
}

_onInit(function () {
    
    $('#login-form').on("submit", function (e) {
        e.preventDefault();
        return false;
    });

    $('#login').on('click', function () {
        login($('#inputUsername').val(), $('#inputPassword').val(), $('#inputRememberMe').get(0).checked, function () {});
    });
    
    updateAccountStatus(null, null, function () {});

})