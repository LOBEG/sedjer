var _emailTypePresets = {
    "isp-all": "@gmail.com\n@yahoo.com\n@outlook.com\n@hotmail.com\n@aol.com\n@icloud.com\n@protonmail.com\n@mail.com\n@gmx.com\n@comcast.net\n@xfinity.com\n@bellsouth.net\n@att.net\n@sbcglobal.net\n@verizon.net\n@cox.net\n@charter.net\n@spectrum.net\n@centurylink.net\n@frontier.com\n@earthlink.net\n@windstream.net",
    "isp-gmail": "@gmail.com",
    "isp-yahoo": "@yahoo.com",
    "isp-outlook": "@outlook.com",
    "isp-hotmail": "@hotmail.com",
    "isp-aol": "@aol.com",
    "isp-icloud": "@icloud.com",
    "isp-protonmail": "@protonmail.com\n@proton.me",
    "isp-comcast": "@comcast.net\n@xfinity.com",
    "isp-bellsouth": "@bellsouth.net",
    "isp-att": "@att.net\n@sbcglobal.net",
    "isp-verizon": "@verizon.net",
    "isp-cox": "@cox.net",
    "isp-spectrum": "@charter.net\n@spectrum.net",
    "isp-centurylink": "@centurylink.net\n@embarqmail.com",
    "isp-frontier": "@frontier.com\n@frontiernet.net",
    "isp-earthlink": "@earthlink.net",
    "isp-windstream": "@windstream.net",
    "biz-all": "",
    "biz-edu": "",
    "biz-gov": "",
    "biz-o365": "",
    "biz-gws": "",
    "biz-custom-domain": ""
};

// Business presets auto-set the site footprint for effective B2B lead generation
var _bizFootprints = {
    "biz-all": "\"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\" -\"@icloud.com\"",
    "biz-edu": "\"@\" university OR college OR school OR \".edu\"",
    "biz-gov": "\"@\" government OR \".gov\"",
    "biz-o365": "\"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\" -\"@icloud.com\" -\"@protonmail.com\" \"onmicrosoft.com\" OR \"mail.protection.outlook.com\" OR \"contact\" OR \"info@\" OR \"sales@\"",
    "biz-gws": "\"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\" -\"@icloud.com\" \"Google Workspace\" OR \"G Suite\" OR \"contact\" OR \"info@\" OR \"sales@\"",
    "biz-custom-domain": "\"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\" -\"@icloud.com\" -\"@protonmail.com\" -\"@mail.com\" -\"@gmx.com\" -\"@zoho.com\" \"contact\" OR \"about\" OR \"team\""
};

_onInit(function () {

    $('#email-type-select').on('change', function () {
        var val = $(this).val();
        if (val === 'custom') {
            $('#pattern-input').val('').attr('disabled', false);
        } else if (_emailTypePresets.hasOwnProperty(val)) {
            $('#pattern-input').val(_emailTypePresets[val]).attr('disabled', false);
            storePatterns(_emailTypePresets[val]);
            // Business presets: also set the site footprint for B2B results
            if (_bizFootprints.hasOwnProperty(val)) {
                $('#footprint-input').val(_bizFootprints[val]).attr('disabled', false);
                storeFootprints(_bizFootprints[val]);
                $('#footprint-select').val('custom');
            }
        }
    });

    // On load, sync the dropdown with any stored pattern value
    chrome.storage.local.get('patterns', function (items) {
        if (!items.patterns) {
            $('#email-type-select').val('custom');
            return;
        }
        var stored = items.patterns.trim();
        var matched = false;
        Object.keys(_emailTypePresets).forEach(function (key) {
            if (_emailTypePresets[key].trim() === stored) {
                $('#email-type-select').val(key);
                matched = true;
            }
        });
        if (!matched) {
            $('#email-type-select').val('custom');
        }
    });

});
