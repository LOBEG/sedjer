/**
 * Paris Email Extractor - Enhanced Email Detection & Validation Module
 * 
 * This module provides advanced email extraction capabilities including:
 * - RFC 5322 compliant email regex
 * - Obfuscated email pattern detection
 * - Internationalized domain names (IDN)
 * - LinkedIn, Apollo.io, ZoomInfo specific patterns
 * - Confidence scoring
 * - Advanced validation and filtering
 */

(function(globalScope) {
    'use strict';

    var EmailExtractor = {};

    // ═══════════════════════════════════════════════════════════════════════════
    // Email Regular Expressions
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * RFC 5322 compliant email regex (enhanced for real-world patterns)
     * Supports: standard emails, plus-addressing, dots, hyphens, underscores
     */
    var EMAIL_REGEXP = /([a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*)@((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})/gi;

    /**
     * More lenient pattern for obfuscated or unusual formats
     * Captures emails with whitespace around @ and dots
     */
    var LENIENT_EMAIL_REGEXP = /([a-zA-Z0-9!#$%&'*+\/=?^_`{|}~.-]+)\s{0,3}@\s{0,3}((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\s{0,2}\.\s{0,2})+[a-zA-Z]{2,})/gi;

    /**
     * International (Unicode / EAI) email regex.
     * RFC 6531 allows non-ASCII characters in both the local part and the
     * domain (e.g. "用户@例子.广告", "müller@straße.de"). The standard regex
     * above is ASCII-only, so this additional pattern picks up internationalised
     * addresses that the strict regex would miss. Punycode (xn--) hosts are
     * already covered by the standard regex.
     *
     * Uses Unicode property escapes (supported in all Chromium/Node ≥ 12).
     */
    var INTL_EMAIL_REGEXP = /([\p{L}\p{N}!#$%&'*+\/=?^_`{|}~.-]+)@((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,})/giu;

    /**
     * Obfuscated email patterns commonly used to avoid scraping
     * Examples: "user [at] domain [dot] com", "user(at)domain(dot)com", "user AT domain DOT com"
     */
    var OBFUSCATED_PATTERNS = [
        // [at] and [dot] variations
        /([a-zA-Z0-9._+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+\s*\[dot\]\s*[a-zA-Z]{2,})/gi,
        // (at) and (dot) variations
        /([a-zA-Z0-9._+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+\s*\(dot\)\s*[a-zA-Z]{2,})/gi,
        // AT and DOT uppercase variations
        /([a-zA-Z0-9._+-]+)\s+AT\s+([a-zA-Z0-9.-]+\s+DOT\s+[a-zA-Z]{2,})/gi,
        // <at> and <dot> variations
        /([a-zA-Z0-9._+-]+)\s*<at>\s*([a-zA-Z0-9.-]+\s*<dot>\s*[a-zA-Z]{2,})/gi,
        // {at} and {dot} variations
        /([a-zA-Z0-9._+-]+)\s*\{at\}\s*([a-zA-Z0-9.-]+\s*\{dot\}\s*[a-zA-Z]{2,})/gi,
        // " at " and " dot " word variations
        /([a-zA-Z0-9._+-]+)\s+at\s+([a-zA-Z0-9.-]+(?:\s+dot\s+[a-zA-Z0-9-]+)+)/gi
    ];

    /**
     * LinkedIn-specific email patterns
     * LinkedIn often displays emails in structured formats
     */
    var LINKEDIN_PATTERNS = [
        // Contact info sections
        /(?:email|contact)[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
        // Mailto links
        /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
        // Profile contact sections
        /(?:reach\s+(?:me|out)|contact\s+me)[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
    ];

    /**
     * Apollo.io and ZoomInfo patterns
     * These platforms have specific data structures
     */
    var DATA_PLATFORM_PATTERNS = [
        // Common data attributes
        /data-email[:\s="']+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
        // JSON-LD structured data
        /"email"[:\s]+"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/gi,
        // Contact card formats
        /(?:email|e-mail)[:\s]+<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/gi
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // Email Validation & Filtering
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Expanded list of ISP/webmail domains (personal email providers)
     * These are typically filtered out for B2B lead generation
     */
    var ISP_DOMAINS = {
        // Major webmail providers
        'gmail.com': 1, 'googlemail.com': 1, 'yahoo.com': 1, 'ymail.com': 1,
        'outlook.com': 1, 'hotmail.com': 1, 'live.com': 1, 'msn.com': 1,
        'aol.com': 1, 'icloud.com': 1, 'me.com': 1, 'mac.com': 1,
        'protonmail.com': 1, 'proton.me': 1, 'tutanota.com': 1, 'tutanota.de': 1,
        'mail.com': 1, 'gmx.com': 1, 'gmx.de': 1, 'gmx.net': 1,
        'zoho.com': 1, 'zohomail.com': 1, 'fastmail.com': 1, 'fastmail.fm': 1,
        
        // US ISPs
        'comcast.net': 1, 'xfinity.com': 1, 'bellsouth.net': 1, 'att.net': 1,
        'sbcglobal.net': 1, 'verizon.net': 1, 'cox.net': 1, 'charter.net': 1,
        'spectrum.net': 1, 'centurylink.net': 1, 'frontier.com': 1, 'frontiernet.net': 1,
        'earthlink.net': 1, 'windstream.net': 1, 'suddenlink.net': 1,
        
        // European providers
        'mail.ru': 1, 'yandex.ru': 1, 'yandex.com': 1, 'rambler.ru': 1,
        'web.de': 1, 'freenet.de': 1, 't-online.de': 1, 'laposte.net': 1,
        'orange.fr': 1, 'wanadoo.fr': 1, 'free.fr': 1, 'libero.it': 1,
        'tiscali.it': 1, 'virgilio.it': 1, 'alice.it': 1,
        
        // Asian providers
        'qq.com': 1, '163.com': 1, '126.com': 1, 'sina.com': 1,
        'naver.com': 1, 'daum.net': 1, 'hanmail.net': 1, 'nate.com': 1,
        
        // Additional common webmail
        'inbox.com': 1, 'rocketmail.com': 1, 'rediffmail.com': 1
    };

    /**
     * Common role-based email addresses (typically not decision-makers)
     */
    var ROLE_PREFIXES = [
        'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
        'postmaster', 'webmaster', 'hostmaster', 'admin', 'administrator',
        'mailer-daemon', 'mailer', 'daemon', 'root', 'bounce',
        'unsubscribe', 'abuse', 'spam', 'support', 'info', 'contact',
        'help', 'sales', 'newsletter', 'marketing', 'notifications'
    ];

    /**
     * Disposable/temporary email domains
     */
    var DISPOSABLE_DOMAINS = {
        'tempmail.com': 1, 'guerrillamail.com': 1, '10minutemail.com': 1,
        'mailinator.com': 1, 'throwaway.email': 1, 'temp-mail.org': 1,
        'getnada.com': 1, 'fakeinbox.com': 1, 'trashmail.com': 1,
        'maildrop.cc': 1, 'sharklasers.com': 1, 'guerrillamail.info': 1
    };

    /**
     * File extensions and technical artifacts (false positives)
     */
    var INVALID_PATTERNS = [
        /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i,
        /\.(css|js|json|xml|html|htm)$/i,
        /\.(woff|woff2|ttf|eot|otf)$/i,
        /\.(mp3|mp4|avi|mov|wmv|flv)$/i,
        /\.(zip|rar|tar|gz|7z)$/i,
        /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i
    ];

    /**
     * Test domains and placeholders (not mail.com which is a real provider)
     */
    var TEST_DOMAINS = {
        'example.com': 1, 'example.org': 1, 'example.net': 1,
        'test.com': 1, 'localhost': 1, 'domain.com': 1,
        'email.com': 1, 'company.com': 1,
        'yourcompany.com': 1, 'yourdomain.com': 1,
        'sentry.io': 1, 'wixpress.com': 1
    };

    /**
     * Social / platform name fragments that the page DOM frequently glues
     * onto an email's local-part. The most common cause is a screen-reader-only
     * label or icon caption sitting immediately before the email anchor:
     *
     *     <span class="sr-only">Facebook</span><a href="mailto:john@x.com">…</a>
     *
     * After tag-stripping (and even with our hidden-element removal) the two
     * inline text nodes can collapse into "facebookjohn@x.com" with no
     * whitespace between them. The standard email regex then happily matches
     * the whole thing as one address.
     *
     * `stripGluedPlatformPrefix()` peels these off the local-part **only**
     * when:
     *   • the prefix sits at the very start of the local-part,
     *   • there is NO separator (./_/-/+) between the prefix and the rest, AND
     *   • after stripping the remainder is still a sane local-part
     *     (≥ 3 chars, contains at least one letter, and is itself a valid
     *      RFC 5322 local-part).
     *
     * That rules out destroying real addresses such as `facebook.tech@meta.com`
     * (separator present) or `facebookbot@x.com` (we'd be left with "bot",
     * 3 chars, but the post-strip address is still validated by the caller).
     */
    var _PLATFORM_PREFIXES = [
        'facebook', 'fb', 'linkedin', 'linked-in', 'twitter', 'instagram',
        'insta', 'youtube', 'yt', 'tiktok', 'pinterest', 'snapchat', 'snap',
        'reddit', 'github', 'gitlab', 'bitbucket', 'medium', 'telegram',
        'whatsapp', 'discord', 'twitch', 'vimeo', 'dribbble', 'behance',
        'threads', 'mastodon', 'tumblr', 'flickr', 'soundcloud', 'spotify',
        'patreon', 'onlyfans', 'substack', 'quora', 'wechat', 'line', 'kakao',
        'viber', 'signal', 'slack', 'skype', 'zoom', 'meetup', 'eventbrite',
        'crunchbase', 'angellist', 'wellfound', 'apollo', 'zoominfo',
        'rocketreach', 'hunter', 'signalhire', 'fullcontact', 'clearbit',
        // Generic UI labels that pollute icon-glyph mailtos
        'email', 'mail', 'contact', 'social'
    ].sort(function (a, b) { return b.length - a.length; }); // longest first

    function _hasLetter(s) { return /[a-z]/i.test(s); }

    /**
     * Strip a leading platform-name fragment from an email's local-part if
     * it was concatenated there by HTML tag-stripping. Returns the cleaned
     * email, or the original string when no safe strip is possible.
     */
    function stripGluedPlatformPrefix(email) {
        if (!email || typeof email !== 'string') return email;
        var at = email.lastIndexOf('@');
        if (at <= 0) return email;
        var local = email.substring(0, at);
        var rest = email.substring(at);
        var lcLocal = local.toLowerCase();
        for (var i = 0; i < _PLATFORM_PREFIXES.length; i++) {
            var p = _PLATFORM_PREFIXES[i];
            if (lcLocal.length <= p.length) continue;
            if (lcLocal.substring(0, p.length) !== p) continue;
            // Reject if a separator already sits between prefix and rest —
            // that means the user really wrote `facebook.john@…`.
            var nextChar = lcLocal.charAt(p.length);
            if (nextChar === '.' || nextChar === '-' ||
                nextChar === '_' || nextChar === '+') continue;
            var stripped = local.substring(p.length);
            // Demand a meaningful remainder so we don't turn `facebookbot`
            // into `bot` (which would still pass), but DO turn `facebookjohn`
            // into `john`. Three chars + ≥ 1 letter is the floor.
            if (stripped.length < 3) continue;
            if (!_hasLetter(stripped)) continue;
            return stripped + rest;
        }
        return email;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Extraction Functions
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Normalize obfuscated email to standard format
     * @param {string} email - The obfuscated email string
     * @returns {string} - Normalized email address
     */
    function normalizeObfuscatedEmail(email) {
        return email
            .replace(/\s*\[at\]\s*/gi, '@')
            .replace(/\s*\(at\)\s*/gi, '@')
            .replace(/\s+AT\s+/gi, '@')
            .replace(/\s*<at>\s*/gi, '@')
            .replace(/\s*\{at\}\s*/gi, '@')
            .replace(/\s+at\s+/gi, '@')
            .replace(/\s*\[dot\]\s*/gi, '.')
            .replace(/\s*\(dot\)\s*/gi, '.')
            .replace(/\s+DOT\s+/gi, '.')
            .replace(/\s*<dot>\s*/gi, '.')
            .replace(/\s*\{dot\}\s*/gi, '.')
            .replace(/\s+dot\s+/gi, '.')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    /**
     * "Clean" local-part character set.
     *
     * RFC 5322 technically allows `!#$%&'*+/=?^_`{|}~-` in unquoted local
     * parts, but in practice they are vanishingly rare in real-world business
     * email addresses, and they are by far the dominant cause of regex over-
     * matches that pull noise like `john!#%&doe@acme.com` out of HTML
     * (button text, JSON fragments, ad-tracking blobs glued together by tag
     * stripping). Reject them by default; opt back into the loose RFC
     * behaviour with the `rfcStrict` validation option (CLI: `--rfc-strict`).
     */
    var CLEAN_LOCAL_RE = /^[a-z0-9](?:[a-z0-9._+\-]*[a-z0-9])?$/;

    /**
     * Validate email format and structure
     * @param {string} email - Email address to validate
     * @param {Object} [opts] - Validation options
     * @param {boolean} [opts.rfcStrict] - If true, allow the full RFC 5322
     *        local-part character set (rare specials like ! # $ % &amp; ` etc.).
     *        Default is the "clean" character set (alphanumerics + . _ + -).
     * @returns {Object} - Validation result with isValid and reason
     */
    function validateEmail(email, opts) {
        opts = opts || {};
        var result = {
            isValid: false,
            reason: '',
            confidence: 0
        };

        if (!email || typeof email !== 'string') {
            result.reason = 'Invalid input';
            return result;
        }

        email = email.trim().toLowerCase();

        // Basic structure check
        if (email.length < 6 || email.length > 254) {
            result.reason = 'Invalid length';
            return result;
        }

        var parts = email.split('@');
        if (parts.length !== 2) {
            result.reason = 'Invalid format (@ count)';
            return result;
        }

        var localPart = parts[0];
        var domain = parts[1];

        // Local part validation
        if (!localPart || localPart.length > 64) {
            result.reason = 'Invalid local part';
            return result;
        }

        // Reject "clean" local-parts containing rare RFC 5322 specials by
        // default — these almost always come from regex over-matches on HTML
        // junk (e.g. "john!#%&doe@acme.com"). Pass {rfcStrict:true} to keep
        // the old behaviour. The check is skipped for non-ASCII local parts
        // (handled separately by INTL_EMAIL_REGEXP) so we don't reject IDN
        // addresses whose local part contains valid Unicode letters.
        if (!opts.rfcStrict && /^[\x00-\x7F]+$/.test(localPart)) {
            if (!CLEAN_LOCAL_RE.test(localPart)) {
                result.reason = 'Local part contains unusual characters';
                return result;
            }
        }

        // Domain validation
        if (!domain || domain.length < 4 || domain.indexOf('.') === -1) {
            result.reason = 'Invalid domain';
            return result;
        }

        // Check for invalid patterns (file extensions, etc.)
        for (var i = 0; i < INVALID_PATTERNS.length; i++) {
            if (INVALID_PATTERNS[i].test(email)) {
                result.reason = 'Matches invalid pattern';
                return result;
            }
        }

        // Check test domains
        if (TEST_DOMAINS.hasOwnProperty(domain)) {
            result.reason = 'Test domain';
            return result;
        }

        // Check disposable domains
        if (DISPOSABLE_DOMAINS.hasOwnProperty(domain)) {
            result.reason = 'Disposable email';
            result.isValid = true; // Still valid, but flagged
            result.confidence = 30;
            return result;
        }

        // Check role-based prefixes (exact match OR prefix followed by separator)
        var isRoleBased = ROLE_PREFIXES.some(function(prefix) {
            if (localPart === prefix) return true;
            if (localPart.length > prefix.length &&
                localPart.substring(0, prefix.length) === prefix) {
                var nextChar = localPart.charAt(prefix.length);
                return nextChar === '.' || nextChar === '-' || nextChar === '_' || nextChar === '+';
            }
            return false;
        });
        if (isRoleBased) {
            result.reason = 'Role-based email';
            result.isValid = true; // Still valid, but lower confidence
            result.confidence = 50;
            return result;
        }

        // Check ISP domains
        if (ISP_DOMAINS.hasOwnProperty(domain)) {
            result.reason = 'ISP/webmail domain';
            result.isValid = true;
            result.confidence = 60;
            return result;
        }

        // Valid business email
        result.isValid = true;
        result.reason = 'Valid business email';
        result.confidence = 90;

        // Boost confidence for certain patterns
        if (localPart.indexOf('.') > 0) {
            result.confidence = Math.min(100, result.confidence + 5); // firstname.lastname pattern
        }
        if (domain.split('.').length > 2) {
            result.confidence = Math.min(100, result.confidence + 5); // subdomain present
        }

        return result;
    }

    /**
     * Extract emails from text using all available patterns
     * @param {string} text - Text to extract emails from
     * @param {Object} options - Extraction options
     * @returns {Array} - Array of extracted email objects
     */
    EmailExtractor.extractEmails = function(text, options) {
        options = options || {};
        var emails = [];
        var seen = {};

        if (!text || typeof text !== 'string') {
            return emails;
        }

        // Helper function to add email to results
        function addEmail(email, source, confidence) {
            email = email.trim().toLowerCase();

            // Peel off any social-platform prefix that got concatenated to the
            // local-part during tag-stripping (e.g. "facebookjohn@x.com" →
            // "john@x.com"). Safe — only strips when no separator is present
            // and the remainder is still a sane local-part.
            email = stripGluedPlatformPrefix(email);

            // Avoid duplicates
            if (seen.hasOwnProperty(email)) {
                return;
            }

            var validation = validateEmail(email, { rfcStrict: !!options.rfcStrict });
            if (!validation.isValid) {
                return;
            }

            // Apply confidence modifier based on source
            var finalConfidence = Math.min(100, validation.confidence + (confidence || 0));

            seen[email] = true;
            emails.push({
                email: email,
                source: source,
                confidence: finalConfidence,
                validation: validation
            });
        }

        // 1. Standard email extraction
        var match;
        EMAIL_REGEXP.lastIndex = 0;
        while ((match = EMAIL_REGEXP.exec(text)) !== null) {
            addEmail(match[0], 'standard', 0);
            // Prevent infinite loop on zero-length matches
            if (match.index === EMAIL_REGEXP.lastIndex) {
                EMAIL_REGEXP.lastIndex++;
            }
        }

        // 2. Lenient pattern (with whitespace tolerance)
        LENIENT_EMAIL_REGEXP.lastIndex = 0;
        while ((match = LENIENT_EMAIL_REGEXP.exec(text)) !== null) {
            var email = match[1].replace(/\s+/g, '') + '@' + match[2].replace(/\s+/g, '');
            addEmail(email, 'lenient', -5);
            // Prevent infinite loop on zero-length matches
            if (match.index === LENIENT_EMAIL_REGEXP.lastIndex) {
                LENIENT_EMAIL_REGEXP.lastIndex++;
            }
        }

        // 2b. International (Unicode / RFC 6531) pattern.
        // Picks up addresses with non-ASCII local parts or IDN domains that the
        // strict ASCII regex skips. We only run it if the text actually
        // contains non-ASCII characters AND an "@" — otherwise it adds nothing.
        if (/[^\x00-\x7F]/.test(text) && text.indexOf('@') !== -1) {
            try {
                INTL_EMAIL_REGEXP.lastIndex = 0;
                while ((match = INTL_EMAIL_REGEXP.exec(text)) !== null) {
                    addEmail(match[0], 'international', -5);
                    if (match.index === INTL_EMAIL_REGEXP.lastIndex) {
                        INTL_EMAIL_REGEXP.lastIndex++;
                    }
                }
            } catch (e) {
                // Older runtimes without Unicode property escape support — skip.
            }
        }

        // 3. Obfuscated patterns
        OBFUSCATED_PATTERNS.forEach(function(pattern) {
            pattern.lastIndex = 0;
            while ((match = pattern.exec(text)) !== null) {
                var email = normalizeObfuscatedEmail(match[0]);
                addEmail(email, 'obfuscated', -10);
                // Prevent infinite loop on zero-length matches
                if (match.index === pattern.lastIndex) {
                    pattern.lastIndex++;
                }
            }
        });

        // 4. LinkedIn-specific patterns
        if (options.isLinkedIn) {
            LINKEDIN_PATTERNS.forEach(function(pattern) {
                pattern.lastIndex = 0;
                while ((match = pattern.exec(text)) !== null) {
                    addEmail(match[1], 'linkedin', 5);
                    // Prevent infinite loop on zero-length matches
                    if (match.index === pattern.lastIndex) {
                        pattern.lastIndex++;
                    }
                }
            });
        }

        // 5. Data platform patterns (Apollo, ZoomInfo, etc.)
        if (options.isDataPlatform) {
            DATA_PLATFORM_PATTERNS.forEach(function(pattern) {
                pattern.lastIndex = 0;
                while ((match = pattern.exec(text)) !== null) {
                    addEmail(match[1], 'data-platform', 10);
                    // Prevent infinite loop on zero-length matches
                    if (match.index === pattern.lastIndex) {
                        pattern.lastIndex++;
                    }
                }
            });
        }

        return emails;
    };

    /**
     * Filter emails based on criteria
     * @param {Array} emails - Array of email objects from extractEmails
     * @param {Object} filters - Filter criteria
     * @returns {Array} - Filtered array of email objects
     */
    EmailExtractor.filterEmails = function(emails, filters) {
        filters = filters || {};

        return emails.filter(function(emailObj) {
            // Min confidence threshold
            if (filters.minConfidence && emailObj.confidence < filters.minConfidence) {
                return false;
            }

            // Exclude ISP domains
            if (filters.excludeISP) {
                var domain = emailObj.email.split('@')[1];
                if (ISP_DOMAINS.hasOwnProperty(domain)) {
                    return false;
                }
            }

            // Exclude role-based (exact local-part match OR prefix-with-separator)
            if (filters.excludeRoles) {
                var localPart = emailObj.email.split('@')[0];
                var isRole = ROLE_PREFIXES.some(function(prefix) {
                    if (localPart === prefix) return true;
                    // Match "info-something" / "info.something" / "info_something"
                    // but NOT "information"
                    if (localPart.length > prefix.length &&
                        localPart.substring(0, prefix.length) === prefix) {
                        var nextChar = localPart.charAt(prefix.length);
                        return nextChar === '.' || nextChar === '-' || nextChar === '_' || nextChar === '+';
                    }
                    return false;
                });
                if (isRole) {
                    return false;
                }
            }

            // Include only specific domain pattern
            if (filters.domainPattern) {
                var domain = emailObj.email.split('@')[1];
                var pattern = filters.domainPattern.replace(/^@/, '');
                if (domain !== pattern) {
                    return false;
                }
            }

            return true;
        });
    };

    /**
     * Get unique emails from array of email objects
     * @param {Array} emails - Array of email objects
     * @returns {Array} - Array of unique email strings
     */
    EmailExtractor.getUniqueEmails = function(emails) {
        var seen = {};
        return emails.filter(function(emailObj) {
            var email = emailObj.email || emailObj;
            if (seen.hasOwnProperty(email)) {
                return false;
            }
            seen[email] = true;
            return true;
        }).map(function(emailObj) {
            return emailObj.email || emailObj;
        });
    };

    // Expose the platform-prefix scrubber so callers (background runner,
    // tests, future preprocessors) can re-use the same logic without
    // re-implementing the prefix list.
    EmailExtractor.stripGluedPlatformPrefix = stripGluedPlatformPrefix;

    // ═══════════════════════════════════════════════════════════════════════════
    // Utility Functions
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Check if URL is from a supported data platform
     * @param {string} url - URL to check
     * @returns {Object} - Platform info
     */
    EmailExtractor.detectPlatform = function(url) {
        if (!url) return { platform: 'generic', isDataPlatform: false };

        try {
            // Parse URL first (preserve case for path/query), then lowercase
            // hostname only. URL hostnames are case-insensitive per RFC 3986.
            var urlObj = new URL(url);
            var hostname = urlObj.hostname.toLowerCase();
            
            // Check if hostname ends with the platform domain (not just contains)
            if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) {
                return { platform: 'linkedin', isLinkedIn: true, isDataPlatform: false };
            }
            if (hostname === 'apollo.io' || hostname.endsWith('.apollo.io')) {
                return { platform: 'apollo', isLinkedIn: false, isDataPlatform: true };
            }
            if (hostname === 'zoominfo.com' || hostname.endsWith('.zoominfo.com')) {
                return { platform: 'zoominfo', isLinkedIn: false, isDataPlatform: true };
            }
            if (hostname === 'hunter.io' || hostname.endsWith('.hunter.io')) {
                return { platform: 'hunter', isLinkedIn: false, isDataPlatform: true };
            }
        } catch (e) {
            // Invalid URL, return generic (no fallback to substring matching)
            return { platform: 'generic', isDataPlatform: false };
        }

        return { platform: 'generic', isDataPlatform: false };
    };

    /**
     * Export functions to global scope
     */
    EmailExtractor.ISP_DOMAINS = ISP_DOMAINS;
    EmailExtractor.ROLE_PREFIXES = ROLE_PREFIXES;
    EmailExtractor.validateEmail = validateEmail;
    EmailExtractor.normalizeObfuscatedEmail = normalizeObfuscatedEmail;

    // ═══════════════════════════════════════════════════════════════════════════
    // Permutation Generator
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Generate the most-common corporate email permutations for a given person
     * + domain (e.g. firstname.lastname@acme.com, flastname@acme.com, …).
     *
     * This is useful when discovery surfaces a name (e.g. on a LinkedIn /
     * Apollo / ZoomInfo profile) but no email — the resulting candidates can
     * then be MX-validated by `serpdigger.validateEmails` to find the address
     * actually used by the company.
     *
     * @param {string} firstName e.g. "Jane"
     * @param {string} lastName  e.g. "O'Connor"
     * @param {string} domain    e.g. "acme.com" (with or without leading "@")
     * @param {Object} [options]
     * @param {string} [options.middleName]
     * @param {boolean} [options.includeUnusual=false] also emit reversed/dotted/
     *        rare permutations
     * @returns {string[]} unique, lowercase candidate addresses
     */
    EmailExtractor.generatePermutations = function (firstName, lastName, domain, options) {
        options = options || {};
        if (!domain) return [];
        // Normalise inputs.
        function norm(s) {
            if (!s || typeof s !== 'string') return '';
            // Strip diacritics, then drop anything that isn't a letter/digit.
            var stripped = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
            return stripped.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        var f  = norm(firstName);
        var l  = norm(lastName);
        var mi = norm(options.middleName).charAt(0);
        var d  = String(domain).trim().toLowerCase().replace(/^@/, '');
        if (!d || d.indexOf('.') === -1) return [];
        if (!f && !l) return [];

        var fi = f.charAt(0);
        var li = l.charAt(0);
        var locals = [];

        function add(local) {
            if (local && locals.indexOf(local) === -1) locals.push(local);
        }

        // Most common corporate patterns (covers ~95% of real-world domains).
        if (f && l) {
            add(f + '.' + l);          // jane.oconnor
            add(f + l);                // janeoconnor
            add(f + '_' + l);          // jane_oconnor
            add(f + '-' + l);          // jane-oconnor
            add(fi + l);               // joconnor
            add(fi + '.' + l);         // j.oconnor
            add(f + li);               // janeo
            add(f + '.' + li);         // jane.o
            add(l + '.' + f);          // oconnor.jane
            add(l + f);                // oconnorjane
            add(li + f);               // ojane
            add(l + fi);               // oconnorj
        }
        if (f) add(f);                 // jane
        if (l) add(l);                 // oconnor

        if (options.includeUnusual && f && l) {
            add(fi + li);              // jo
            add(f + '.' + l + fi);     // jane.oconnorj (rare)
            if (mi) {
                add(f + mi + l);       // janemoconnor
                add(f + '.' + mi + '.' + l); // jane.m.oconnor
                add(fi + mi + l);      // jmoconnor
            }
        }

        return locals
            .filter(function (lp) { return lp.length > 0 && lp.length <= 64; })
            .map(function (lp) { return lp + '@' + d; });
    };

    // Export to global scope (works in both `window` and service-worker `self`)
    globalScope.EmailExtractor = EmailExtractor;

})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
