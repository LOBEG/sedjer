/**
 * Paris Email Extractor — SMTP RCPT-level verifier (CLI only)
 * -----------------------------------------------------------
 *
 * Performs a real SMTP conversation against the recipient's MX server to
 * determine whether the address is deliverable, without actually sending an
 * e-mail (we issue RCPT TO and then QUIT before DATA). Pure Node — uses
 * `net` and `dns.promises`. Has NO dependencies on cli/paris.js so it can
 * also be required from tests.
 *
 * Public API:
 *   verifySmtp(email, opts)         → Promise<{status, code, message, mxHost, durationMs}>
 *   detectCatchAll(domain, opts)    → Promise<boolean>
 *   verifyBatch(emails, opts)       → Promise<Array<{email, smtpStatus, smtpCode, smtpMessage, mxHost, catchAll, durationMs}>>
 *   isDisposableDomain(domain)      → boolean
 *
 * `status` is one of:
 *   deliverable, undeliverable, unknown, timeout, error, blocked, no-mx, invalid
 *
 * Important: this module talks to TCP/25 on third-party servers. Many
 * residential ISPs and cloud providers (notably AWS, Azure, Heroku) block
 * outbound 25; in that case the result will be `error` or `timeout`. The
 * default concurrency is intentionally low (4) because MTAs throttle
 * aggressive probers.
 */
'use strict';

var net  = require('net');
var dns  = require('dns');
var dnsp = dns.promises;
var crypto = require('crypto');

// ── Disposable / throwaway-mail domains ─────────────────────────────────────
// Conservative set; users can extend by editing this file. Lower-cased.
var DISPOSABLE_DOMAINS = {
    '10minutemail.com': 1, '10minutemail.net': 1, 'tempmail.com': 1,
    'temp-mail.org': 1, 'temp-mail.io': 1, 'guerrillamail.com': 1,
    'guerrillamail.info': 1, 'guerrillamail.net': 1, 'guerrillamail.org': 1,
    'sharklasers.com': 1, 'mailinator.com': 1, 'mailinator.net': 1,
    'maildrop.cc': 1, 'getnada.com': 1, 'nada.email': 1, 'getairmail.com': 1,
    'yopmail.com': 1, 'yopmail.fr': 1, 'yopmail.net': 1, 'fakeinbox.com': 1,
    'trashmail.com': 1, 'trashmail.de': 1, 'throwawaymail.com': 1,
    'mintemail.com': 1, 'mohmal.com': 1, 'inboxalias.com': 1,
    'spambox.us': 1, 'spam4.me': 1, 'dispostable.com': 1,
    'mytemp.email': 1, 'mailcatch.com': 1, 'tempinbox.com': 1,
    'mvrht.com': 1, 'fakemailgenerator.com': 1, 'emailondeck.com': 1,
    'discard.email': 1, 'discardmail.com': 1, 'jetable.org': 1,
    'spamgourmet.com': 1, 'mailnesia.com': 1, 'tempr.email': 1,
    'mailbox.org': 0 // legitimate; explicitly NOT disposable. (0-flag = ignored)
};

function isDisposableDomain(domain) {
    if (!domain) return false;
    var d = String(domain).toLowerCase().trim();
    return !!DISPOSABLE_DOMAINS[d];
}

// ── Resolve & sort MX records (lowest priority first) ──────────────────────
var _mxCache = Object.create(null);
function _resolveMx(domain) {
    if (_mxCache[domain]) return Promise.resolve(_mxCache[domain]);
    return dnsp.resolveMx(domain)
        .then(function (records) {
            if (!Array.isArray(records) || records.length === 0) {
                _mxCache[domain] = [];
                return [];
            }
            records.sort(function (a, b) { return (a.priority|0) - (b.priority|0); });
            var hosts = records.map(function (r) { return String(r.exchange).replace(/\.$/, ''); })
                .filter(Boolean);
            _mxCache[domain] = hosts;
            return hosts;
        })
        .catch(function () {
            // Implicit MX: a domain with only A/AAAA may still receive mail.
            return dnsp.resolve(domain)
                .then(function () { _mxCache[domain] = [domain]; return [domain]; })
                .catch(function () { _mxCache[domain] = []; return []; });
        });
}

// ── Single SMTP RCPT probe ──────────────────────────────────────────────────
// Returns {status, code, message, mxHost, durationMs}.
function _probeRcpt(target, mxHost, opts) {
    opts = opts || {};
    var helo     = opts.helo || 'paris-verifier.local';
    var from     = opts.from || ('postmaster@' + helo);
    var port     = opts.port || 25;
    var timeoutMs = opts.timeoutMs || 10000;
    var started = Date.now();

    return new Promise(function (resolve) {
        var socket = new net.Socket();
        var buffer = '';
        var settled = false;
        var step = 0;
        var lastCode = 0;
        var lastMessage = '';

        function done(status, code, message) {
            if (settled) return;
            settled = true;
            try { socket.write('QUIT\r\n'); } catch (e) { /* noop */ }
            try { socket.destroy(); } catch (e) { /* noop */ }
            resolve({
                status: status,
                code: code || 0,
                message: message || '',
                mxHost: mxHost,
                durationMs: Date.now() - started
            });
        }

        socket.setTimeout(timeoutMs);
        socket.on('timeout', function () { done('timeout', 0, 'socket timeout'); });
        socket.on('error', function (err) { done('error', 0, (err && err.message) || 'socket error'); });
        socket.on('close', function () {
            if (settled) return;
            // Closed before we could finish — treat as error.
            done('error', lastCode, lastMessage || 'connection closed');
        });

        function sendStep() {
            try {
                if (step === 0) {
                    socket.write('EHLO ' + helo + '\r\n');
                } else if (step === 1) {
                    // Some legacy MTAs reject EHLO; fall back to HELO.
                    if (lastCode >= 500) {
                        socket.write('HELO ' + helo + '\r\n');
                    } else {
                        socket.write('MAIL FROM:<' + from + '>\r\n');
                        step = 2;
                        return;
                    }
                } else if (step === 2) {
                    socket.write('MAIL FROM:<' + from + '>\r\n');
                } else if (step === 3) {
                    socket.write('RCPT TO:<' + target + '>\r\n');
                }
            } catch (e) {
                done('error', 0, e.message);
            }
        }

        socket.connect(port, mxHost, function () {
            // Wait for the 220 banner before sending EHLO.
        });

        socket.on('data', function (chunk) {
            buffer += chunk.toString('utf8');
            // SMTP replies are line-based, terminated by \r\n. The final line
            // of a multi-line reply has "<code> " (space), continuation
            // lines have "<code>-".
            var lines = buffer.split(/\r\n/);
            buffer = lines.pop(); // possibly partial last line
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (!line) continue;
                var m = /^(\d{3})([ -])(.*)$/.exec(line);
                if (!m) continue;
                lastCode = parseInt(m[1], 10);
                lastMessage = m[3];
                if (m[2] !== ' ') continue; // multi-line, wait for terminator

                if (step === 0) {
                    // banner
                    if (lastCode === 220) {
                        step = 1;
                        sendStep();
                    } else if (lastCode === 421) {
                        return done('blocked', lastCode, lastMessage);
                    } else {
                        return done('error', lastCode, lastMessage);
                    }
                } else if (step === 1) {
                    if (lastCode === 250) {
                        socket.write('MAIL FROM:<' + from + '>\r\n');
                        step = 2;
                    } else if (lastCode >= 500) {
                        // EHLO not supported — fall back to HELO.
                        socket.write('HELO ' + helo + '\r\n');
                        // Stay at step 1 logically but next 250 should advance.
                        step = 11;
                    } else if (lastCode >= 400 && lastCode < 500) {
                        return done('unknown', lastCode, lastMessage);
                    } else {
                        return done('error', lastCode, lastMessage);
                    }
                } else if (step === 11) {
                    if (lastCode === 250) {
                        socket.write('MAIL FROM:<' + from + '>\r\n');
                        step = 2;
                    } else {
                        return done('error', lastCode, lastMessage);
                    }
                } else if (step === 2) {
                    if (lastCode === 250) {
                        socket.write('RCPT TO:<' + target + '>\r\n');
                        step = 3;
                    } else if (lastCode >= 400 && lastCode < 500) {
                        return done('unknown', lastCode, lastMessage);
                    } else {
                        return done('error', lastCode, lastMessage);
                    }
                } else if (step === 3) {
                    if (lastCode === 250 || lastCode === 251) {
                        return done('deliverable', lastCode, lastMessage);
                    }
                    if (lastCode >= 500 && lastCode < 600) {
                        return done('undeliverable', lastCode, lastMessage);
                    }
                    if (lastCode >= 400 && lastCode < 500) {
                        return done('unknown', lastCode, lastMessage);
                    }
                    return done('error', lastCode, lastMessage);
                }
            }
        });
    });
}

// Validate the textual shape of an address. We accept anything with one '@'
// and at least one dot in the domain — we lean on the email-extractor for
// stricter validation upstream.
function _looksLikeEmail(email) {
    if (!email || typeof email !== 'string') return false;
    var at = email.lastIndexOf('@');
    if (at < 1 || at === email.length - 1) return false;
    var dom = email.slice(at + 1);
    return /\./.test(dom);
}

function verifySmtp(email, opts) {
    opts = opts || {};
    if (!_looksLikeEmail(email)) {
        return Promise.resolve({
            status: 'invalid', code: 0, message: 'malformed address',
            mxHost: '', durationMs: 0
        });
    }
    var domain = email.split('@').pop().toLowerCase();
    return _resolveMx(domain).then(function (hosts) {
        if (!hosts || hosts.length === 0) {
            return {
                status: 'no-mx', code: 0, message: 'no MX records',
                mxHost: '', durationMs: 0
            };
        }
        // Try MX hosts in priority order; stop at first non-error result.
        function tryHost(i) {
            if (i >= hosts.length) {
                return {
                    status: 'error', code: 0, message: 'all MX hosts failed',
                    mxHost: hosts[hosts.length - 1] || '', durationMs: 0
                };
            }
            return _probeRcpt(email, hosts[i], opts).then(function (res) {
                if (res.status === 'error' || res.status === 'timeout') {
                    return tryHost(i + 1);
                }
                return res;
            });
        }
        return tryHost(0);
    });
}

// ── Catch-all detection ────────────────────────────────────────────────────
// After a positive RCPT, probe one random 16-char local-part on the same
// domain. If THAT also accepts, the domain is catch-all.
var _catchAllCache = Object.create(null);
function detectCatchAll(domain, opts) {
    domain = String(domain || '').toLowerCase();
    if (!domain) return Promise.resolve(false);
    if (_catchAllCache.hasOwnProperty(domain)) {
        return Promise.resolve(_catchAllCache[domain]);
    }
    var rand = crypto.randomBytes(8).toString('hex'); // 16 hex chars
    var probeAddr = rand + '@' + domain;
    return verifySmtp(probeAddr, opts).then(function (res) {
        var isCatchAll = (res.status === 'deliverable');
        _catchAllCache[domain] = isCatchAll;
        return isCatchAll;
    }).catch(function () {
        _catchAllCache[domain] = false;
        return false;
    });
}

// ── Batch verifier with per-domain serialization & catch-all probe ─────────
//
// emails: array of strings or {email,...} records.
// opts: { concurrency?:4, timeoutMs?, helo?, from?, port?, detectCatchAll?:true,
//         onProgress?(done,total) }
// Resolves to an array of {email, smtpStatus, smtpCode, smtpMessage, mxHost, catchAll, durationMs}.
function verifyBatch(emails, opts) {
    opts = opts || {};
    var concurrency = Math.max(1, opts.concurrency || 4);
    var doCatchAll = opts.detectCatchAll !== false;
    var list = (emails || []).map(function (e) {
        return (typeof e === 'string') ? e : (e && e.email) || '';
    }).filter(Boolean);

    // Group by domain so we can serialize per-domain (port-25 abuse defence).
    var byDomain = Object.create(null);
    list.forEach(function (em) {
        var d = em.split('@').pop().toLowerCase();
        if (!byDomain[d]) byDomain[d] = [];
        byDomain[d].push(em);
    });
    var domains = Object.keys(byDomain);

    var results = Object.create(null);
    var done = 0;
    var total = list.length;

    function processDomain(d) {
        var bucket = byDomain[d];
        // Serialize within a domain.
        return bucket.reduce(function (chain, em) {
            return chain.then(function () {
                return verifySmtp(em, opts).then(function (r) {
                    results[em] = {
                        email: em,
                        smtpStatus: r.status,
                        smtpCode: r.code,
                        smtpMessage: r.message,
                        mxHost: r.mxHost,
                        catchAll: false,
                        durationMs: r.durationMs
                    };
                    done++;
                    if (typeof opts.onProgress === 'function') {
                        try { opts.onProgress(done, total); } catch (e) { /* noop */ }
                    }
                });
            });
        }, Promise.resolve()).then(function () {
            // Catch-all probe — only when at least one address on this
            // domain came back deliverable, to avoid wasting probes on
            // dead domains.
            if (!doCatchAll) return;
            var anyDeliverable = bucket.some(function (em) {
                return results[em] && results[em].smtpStatus === 'deliverable';
            });
            if (!anyDeliverable) return;
            return detectCatchAll(d, opts).then(function (isCa) {
                if (isCa) {
                    bucket.forEach(function (em) {
                        if (results[em]) results[em].catchAll = true;
                    });
                }
            });
        });
    }

    // Domain-level concurrency.
    var idx = 0;
    function worker() {
        if (idx >= domains.length) return Promise.resolve();
        var d = domains[idx++];
        return processDomain(d).then(worker);
    }
    var workers = [];
    for (var i = 0; i < Math.min(concurrency, domains.length); i++) {
        workers.push(worker());
    }
    return Promise.all(workers).then(function () {
        return list.map(function (em) {
            return results[em] || {
                email: em, smtpStatus: 'error', smtpCode: 0,
                smtpMessage: 'no result', mxHost: '', catchAll: false, durationMs: 0
            };
        });
    });
}

module.exports = {
    verifySmtp: verifySmtp,
    verifyBatch: verifyBatch,
    detectCatchAll: detectCatchAll,
    isDisposableDomain: isDisposableDomain,
    DISPOSABLE_DOMAINS: DISPOSABLE_DOMAINS,
    // exported for tests
    _probeRcpt: _probeRcpt
};
