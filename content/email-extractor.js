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
    // Structural extractors (v4.7)
    // ═══════════════════════════════════════════════════════════════════════════
    // These five passes operate on RAW HTML — no live DOM required — so they
    // run identically in the content scripts, the service-worker deep-scan,
    // and the standalone CLI. They surface emails the regex-on-stripped-text
    // path cannot see.
    //
    //   1. Cloudflare cfemail (XOR-encoded mailto blobs)
    //   2. CSS ::before/::after content strings
    //   3. RTL / bidi-override reversal
    //   4. Split-span / fragment reconstruction
    //   5. <script> body decoding (literals, fromCharCode, atob, concat)
    //
    // Each returns an array of plain email strings; the caller pipes them
    // through addEmail() in extractFromHtml() so dedup, validation and the
    // platform-prefix scrub all apply automatically.

    // List of inline elements whose closing/opening tags should be replaced
    // with the EMPTY string (not a space) when flattening HTML to text.
    // Block-level elements are still replaced with a space so we don't glue
    // unrelated paragraphs together. This is the fix for split-span emails:
    //   <span>jane</span><span>@</span><span>acme.com</span>
    // collapses to "jane@acme.com" instead of "jane @ acme.com".
    var _INLINE_TAGS = [
        'span', 'b', 'i', 'em', 'strong', 'small', 'sup', 'sub',
        'mark', 'wbr', 'q', 'code', 'tt', 'font', 'u', 's', 'strike',
        'bdo', 'bdi', 'time', 'cite', 'abbr', 'dfn', 'ins', 'del',
        'kbd', 'samp', 'var', 'ruby', 'rt', 'rp', 'a'
    ];
    var _INLINE_TAG_RE = new RegExp(
        '<\\/?(?:' + _INLINE_TAGS.join('|') + ')\\b[^>]*>', 'gi'
    );

    /**
     * Decode a Cloudflare email-obfuscation hex blob.
     *
     * Cloudflare rewrites every plaintext mailto: into something like:
     *   <a href="/cdn-cgi/l/email-protection#abcdef..."
     *      class="__cf_email__"
     *      data-cfemail="abcdef...">[email&#160;protected]</a>
     *
     * The hex string is XOR-encoded: byte 0 is the key, and each remaining
     * byte XOR'd against the key gives a printable ASCII character.
     *
     * @param {string} hex - lower-case hex string (data-cfemail / fragment).
     * @returns {string} - decoded email, or '' on malformed input.
     */
    function _decodeCfEmail(hex) {
        if (!hex || typeof hex !== 'string') return '';
        hex = hex.replace(/[^0-9a-fA-F]/g, '');
        if (hex.length < 4 || hex.length % 2 !== 0) return '';
        var key = parseInt(hex.substring(0, 2), 16);
        if (isNaN(key)) return '';
        var out = '';
        for (var i = 2; i < hex.length; i += 2) {
            var b = parseInt(hex.substring(i, i + 2), 16);
            if (isNaN(b)) return '';
            out += String.fromCharCode(b ^ key);
        }
        return out;
    }

    /**
     * Find every Cloudflare cfemail blob in `html` and return decoded emails.
     *
     * Looks at three carriers:
     *   - data-cfemail="HEX"
     *   - href="/cdn-cgi/l/email-protection#HEX"
     *   - class="__cf_email__" with the hex payload in any nearby attribute
     *     (we still anchor on data-cfemail; the class is a hint, not a payload).
     */
    function _extractCfEmails(html) {
        var out = [];
        if (!html || typeof html !== 'string') return out;
        // Most reliable: explicit data-cfemail attribute.
        var dataRe = /data-cfemail\s*=\s*["']([0-9a-fA-F]+)["']/gi;
        var m;
        while ((m = dataRe.exec(html)) !== null) {
            var d = _decodeCfEmail(m[1]);
            if (d && d.indexOf('@') !== -1) out.push(d);
            if (m.index === dataRe.lastIndex) dataRe.lastIndex++;
        }
        // Fallback: the mailto-protection URL fragment.
        var hrefRe = /\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/gi;
        while ((m = hrefRe.exec(html)) !== null) {
            var d2 = _decodeCfEmail(m[1]);
            if (d2 && d2.indexOf('@') !== -1) out.push(d2);
            if (m.index === hrefRe.lastIndex) hrefRe.lastIndex++;
        }
        return out;
    }

    /**
     * Pull emails (or fragments that combine into emails) out of CSS
     * `content:` declarations — the .email::after { content:"@acme.com" }
     * trick. We scan two carriers:
     *   - <style>…</style> blocks (any number of rules)
     *   - inline style="content:'…'" attributes (rare but happens)
     *
     * Strategy:
     *   - Single-pass: any content:"…" string that already contains "@" is
     *     emitted as-is.
     *   - Two-pass for the split form: when the same selector base has both
     *     ::before { content:"X" } AND ::after { content:"Y" }, concatenate
     *     X+text+Y candidates. We approximate by collecting all content
     *     strings paired by their immediate selector and joining sequential
     *     pairs whose concatenation looks like an email.
     */
    function _extractCssEmails(html) {
        var out = [];
        if (!html || typeof html !== 'string') return out;

        // Collect every "content:'STRING'" inside <style> blocks and inline
        // style attributes.
        var contentValues = [];
        var styleRe = /<style\b[^>]*>([\s\S]*?)<\/\s*style\s*>/gi;
        var m;
        while ((m = styleRe.exec(html)) !== null) {
            _collectContentValues(m[1], contentValues);
            if (m.index === styleRe.lastIndex) styleRe.lastIndex++;
        }
        var inlineRe = /style\s*=\s*"([^"]*content\s*:[^"]*)"/gi;
        while ((m = inlineRe.exec(html)) !== null) {
            _collectContentValues(m[1], contentValues);
            if (m.index === inlineRe.lastIndex) inlineRe.lastIndex++;
        }
        var inlineRe2 = /style\s*=\s*'([^']*content\s*:[^']*)'/gi;
        while ((m = inlineRe2.exec(html)) !== null) {
            _collectContentValues(m[1], contentValues);
            if (m.index === inlineRe2.lastIndex) inlineRe2.lastIndex++;
        }

        // Single-pass: any content string that ALREADY has "@".
        for (var i = 0; i < contentValues.length; i++) {
            var v = contentValues[i];
            if (v.indexOf('@') !== -1) out.push(v);
        }
        // Pair-pass: ::before content + adjacent ::after value can split a
        // single email across two CSS rules (e.g. content:"jane" + "@acme.com").
        // Only emit a pair when the first piece has NO "@" AND the second
        // STARTS with "@" — otherwise we'd hallucinate "ceo@acme.compress"
        // from ["ceo@acme.com", "press"].
        for (var j = 0; j + 1 < contentValues.length; j++) {
            var a = contentValues[j];
            var b = contentValues[j + 1];
            if (a.indexOf('@') === -1 && b.charAt(0) === '@') {
                var combo = a + b;
                if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(combo)) out.push(combo);
            }
        }
        return out;
    }
    function _collectContentValues(cssText, dest) {
        // Match content:"…" or content:'…'  (allow whitespace, nested escapes).
        var re1 = /content\s*:\s*"((?:[^"\\]|\\.)*)"/g;
        var re2 = /content\s*:\s*'((?:[^'\\]|\\.)*)'/g;
        var m;
        while ((m = re1.exec(cssText)) !== null) {
            dest.push(_unescapeCssString(m[1]));
            if (m.index === re1.lastIndex) re1.lastIndex++;
        }
        while ((m = re2.exec(cssText)) !== null) {
            dest.push(_unescapeCssString(m[1]));
            if (m.index === re2.lastIndex) re2.lastIndex++;
        }
    }
    function _unescapeCssString(s) {
        // Decode \xx hex escapes (CSS uses unicode escape sequences).
        return String(s || '').replace(/\\([0-9a-fA-F]{1,6})\s?/g, function (_, hex) {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return ''; }
        }).replace(/\\(.)/g, '$1');
    }

    // Bidi control characters that flip text direction at the codepoint level
    // (used to display "moc.emca@enaj" as "jane@acme.com" in the browser).
    var _BIDI_CTRL_RE = /[\u202A-\u202E\u2066-\u2069]/g;

    /**
     * Find email-shaped strings hidden via right-to-left styling and return
     * them in normal (LTR) order.
     *
     * Carriers:
     *   - <bdo dir="rtl">…</bdo>  /  any tag with style="direction:rtl"
     *     style="unicode-bidi:bidi-override"
     *   - free-floating text containing the U+202E "RIGHT-TO-LEFT OVERRIDE"
     *     control character, where reversing the substring produces an
     *     email shape.
     */
    function _extractRtlEmails(html) {
        var out = [];
        if (!html || typeof html !== 'string') return out;

        // 1) Tagged RTL elements: capture inner text, reverse, regex.
        //    Match <bdo dir="rtl">…</bdo> and tags with the RTL CSS hint.
        var rtlTagRes = [
            /<bdo\b[^>]*\bdir\s*=\s*["']?rtl["']?[^>]*>([\s\S]*?)<\/\s*bdo\s*>/gi,
            /<([a-z][a-z0-9]*)\b[^>]*\bstyle\s*=\s*"[^"]*(?:direction\s*:\s*rtl|unicode-bidi\s*:\s*bidi-override)[^"]*"[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi,
            /<([a-z][a-z0-9]*)\b[^>]*\bstyle\s*=\s*'[^']*(?:direction\s*:\s*rtl|unicode-bidi\s*:\s*bidi-override)[^']*'[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi
        ];
        for (var r = 0; r < rtlTagRes.length; r++) {
            var re = rtlTagRes[r];
            re.lastIndex = 0;
            var m;
            while ((m = re.exec(html)) !== null) {
                // Last capture is always the inner text; first regex has 1
                // group, the others have 2 (tag name + content).
                var inner = m[m.length - 1] || '';
                // Iteratively strip nested tags until stable. A single
                // /<[^>]+>/g pass leaves orphaned "<script foo" (no '>')
                // behind on malformed input — see CodeQL js/incomplete-
                // multi-character-sanitization. Iterating to a fixed point
                // is safe because each pass is monotonically shorter.
                var prev;
                do {
                    prev = inner;
                    inner = inner.replace(/<[^>]*>/g, '');
                } while (inner !== prev);
                inner = inner.replace(/[<>]/g, '').replace(_BIDI_CTRL_RE, '').trim();
                if (!inner) {
                    if (m.index === re.lastIndex) re.lastIndex++;
                    continue;
                }
                var rev = _reverseString(inner);
                _harvestEmailsInto(rev, out);
                if (m.index === re.lastIndex) re.lastIndex++;
            }
        }

        // 2) Free-floating bidi-override control character. We split on each
        //    U+202E and try reversing the up-to-80-char tail; if it matches
        //    an email shape, emit it.
        if (_BIDI_CTRL_RE.test(html)) {
            // Reset because test() advances lastIndex on global regexes.
            _BIDI_CTRL_RE.lastIndex = 0;
            var pieces = html.split(/[\u202A-\u202E\u2066-\u2069]/);
            for (var p = 1; p < pieces.length; p++) {
                var tail = pieces[p].slice(0, 120);
                _harvestEmailsInto(_reverseString(tail), out);
            }
        }
        return out;
    }
    function _reverseString(s) {
        // Use Array.from to handle surrogate pairs / Unicode safely.
        try { return Array.from(String(s)).reverse().join(''); }
        catch (e) { return String(s).split('').reverse().join(''); }
    }
    function _harvestEmailsInto(text, dest) {
        var re = /[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
        var m;
        while ((m = re.exec(text)) !== null) {
            dest.push(m[0]);
            if (m.index === re.lastIndex) re.lastIndex++;
        }
    }

    /**
     * Strip <script> and <style> blocks and replace inline tags with the
     * EMPTY string before stripping all remaining tags with a space. Result:
     * fragmented emails like
     *   <span>jane</span>@<span>acme.com</span>
     * collapse correctly to "jane@acme.com" instead of being torn apart by
     * spaces, while paragraph boundaries (<p>, <div>, <br>, …) still produce
     * a space so we don't glue unrelated lines.
     */
    function _htmlToTextPreservingInline(html) {
        if (!html || typeof html !== 'string') return '';
        return String(html)
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            // Empty-string substitution for inline tags so split-span emails
            // reconstruct cleanly.
            .replace(_INLINE_TAG_RE, '')
            // Everything else (block tags) becomes a space.
            .replace(/<[^>]+>/g, ' ')
            // Normalise whitespace.
            .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
                try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ' '; }
            })
            .replace(/&#(\d+);/g, function (_, d) {
                try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ' '; }
            })
            .replace(/&amp;/gi, '&');
    }

    /**
     * Scan every <script> body for emails encoded four common ways:
     *   5a. plain string literals  ("jane@acme.com")
     *   5b. String.fromCharCode([…])  arrays
     *   5c. atob("base64-of-email")
     *   5d. concatenated literals    ("jane" + "@" + "acme.com")
     *
     * We deliberately skip <script type="application/ld+json"> because the
     * caller (CLI / SW deep-scan) already preserves JSON-LD content in a
     * separate pass and we'd just double-count.
     */
    function _extractScriptEmails(html) {
        var out = [];
        if (!html || typeof html !== 'string') return out;
        var scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;
        var m;
        while ((m = scriptRe.exec(html)) !== null) {
            var attrs = m[1] || '';
            var body  = m[2] || '';
            // Skip JSON-LD / non-JS / external scripts.
            if (/type\s*=\s*["'][^"']*ld\+json["']/i.test(attrs)) {
                if (m.index === scriptRe.lastIndex) scriptRe.lastIndex++;
                continue;
            }
            if (/src\s*=/i.test(attrs) && body.replace(/\s/g, '') === '') {
                if (m.index === scriptRe.lastIndex) scriptRe.lastIndex++;
                continue;
            }

            // 5a — string literals containing @
            var litRe = /(["'])((?:\\.|(?!\1).){2,200})\1/g;
            var lm;
            while ((lm = litRe.exec(body)) !== null) {
                var raw = lm[2].replace(/\\(.)/g, '$1');
                if (raw.indexOf('@') !== -1) _harvestEmailsInto(raw, out);
                if (lm.index === litRe.lastIndex) litRe.lastIndex++;
            }

            // 5b — String.fromCharCode([…])
            var charRe = /String\.fromCharCode\s*\(\s*([\d,\s]+)\s*\)/g;
            var cm;
            while ((cm = charRe.exec(body)) !== null) {
                var nums = cm[1].split(',').map(function (n) { return parseInt(n, 10); }).filter(function (n) { return !isNaN(n) && n > 0 && n < 0x10FFFF; });
                if (nums.length) {
                    var s = '';
                    try { s = String.fromCodePoint.apply(null, nums); } catch (e) { s = ''; }
                    if (s.indexOf('@') !== -1) _harvestEmailsInto(s, out);
                }
                if (cm.index === charRe.lastIndex) charRe.lastIndex++;
            }

            // 5c — atob("base64")
            var atobRe = /atob\s*\(\s*["']([A-Za-z0-9+/=]{8,})["']\s*\)/g;
            var am;
            while ((am = atobRe.exec(body)) !== null) {
                var dec = _safeBase64Decode(am[1]);
                if (dec && dec.indexOf('@') !== -1) _harvestEmailsInto(dec, out);
                if (am.index === atobRe.lastIndex) atobRe.lastIndex++;
            }

            // 5d — concatenated literals: "a" + "b" + "c"
            var concatRe = /(["'])((?:\\.|(?!\1).)*)\1(?:\s*\+\s*(["'])((?:\\.|(?!\3).)*)\3){1,8}/g;
            var ccm;
            while ((ccm = concatRe.exec(body)) !== null) {
                var pieces = [];
                var partRe = /(["'])((?:\\.|(?!\1).)*)\1/g;
                var pm;
                while ((pm = partRe.exec(ccm[0])) !== null) {
                    pieces.push(pm[2].replace(/\\(.)/g, '$1'));
                    if (pm.index === partRe.lastIndex) partRe.lastIndex++;
                }
                var joined = pieces.join('');
                if (joined.indexOf('@') !== -1) _harvestEmailsInto(joined, out);
                if (ccm.index === concatRe.lastIndex) concatRe.lastIndex++;
            }

            if (m.index === scriptRe.lastIndex) scriptRe.lastIndex++;
        }
        return out;
    }
    function _safeBase64Decode(s) {
        // Works in browser (atob), Node (Buffer), and service-worker contexts.
        try {
            if (typeof atob === 'function') {
                return atob(s);
            }
        } catch (e) { /* malformed input */ return ''; }
        try {
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(s, 'base64').toString('binary');
            }
        } catch (e) { /* fall through */ }
        return '';
    }

    /**
     * One-stop HTML → emails entry point that runs the five structural
     * extractors AND the existing text regex over an inline-preserving
     * tag-strip. Returns the same record shape as `extractEmails()`.
     *
     * This is the function CLI / service-worker / content scripts should
     * prefer for any input that contains markup. Plain-text callers should
     * keep using `extractEmails()` directly.
     */
    EmailExtractor.extractFromHtml = function (html, options) {
        options = options || {};
        var out = [];
        var seen = {};
        function push(records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (!seen[r.email]) {
                    seen[r.email] = true;
                    out.push(r);
                } else {
                    // Keep the highest confidence we've seen for this email.
                    for (var k = 0; k < out.length; k++) {
                        if (out[k].email === r.email && r.confidence > out[k].confidence) {
                            out[k] = r;
                            break;
                        }
                    }
                }
            }
        }

        if (!html || typeof html !== 'string') return out;

        // Run each structural extractor and shove its findings through the
        // existing extractEmails() pipeline (one fake-text-blob per source)
        // so dedup, validation, and the platform-prefix scrub apply
        // automatically.
        function ingest(label, list, bonus) {
            if (!list || !list.length) return;
            // Join with newlines so the regex can pick each email cleanly.
            var blob = list.join('\n');
            var recs = EmailExtractor.extractEmails(blob, options);
            // Re-label and re-score — the pipeline labelled them "standard".
            for (var i = 0; i < recs.length; i++) {
                recs[i].source = label;
                recs[i].confidence = Math.max(0, Math.min(100, (recs[i].confidence || 0) + (bonus || 0)));
            }
            push(recs);
        }

        ingest('cloudflare', _extractCfEmails(html), +5);
        ingest('css',        _extractCssEmails(html), 0);
        ingest('rtl',        _extractRtlEmails(html), 0);
        ingest('script',     _extractScriptEmails(html), -5);

        // Finally, the regular text pass — but using the inline-preserving
        // tag-stripper so split-span emails are reconstructed.
        var text = _htmlToTextPreservingInline(html);
        push(EmailExtractor.extractEmails(text, options));
        return out;
    };

    // Expose the helpers — useful for tests and for the CLI / SW which
    // already do their own preserve-mailto / preserve-jsonld pre-processing
    // and just want the inline-preserving tag stripper.
    EmailExtractor._htmlToTextPreservingInline = _htmlToTextPreservingInline;
    EmailExtractor._decodeCfEmail = _decodeCfEmail;
    EmailExtractor._extractCfEmails = _extractCfEmails;
    EmailExtractor._extractCssEmails = _extractCssEmails;
    EmailExtractor._extractRtlEmails = _extractRtlEmails;
    EmailExtractor._extractScriptEmails = _extractScriptEmails;

    // ═══════════════════════════════════════════════════════════════════════════
    // Contact-name association
    // ═══════════════════════════════════════════════════════════════════════════
    // After extracting an email, scan the surrounding HTML for a likely
    // "owner name" — typically the contents of a nearby <h1>/<h2>/<h3>/<strong>
    // tag (e.g. on a /team page each card has a name heading and an email
    // immediately below it). Returns { email, name, … } objects so callers
    // can render a "Name" column in CSV/JSON output.
    //
    // Heuristic (no DOM dependency, just regex over the original HTML):
    //   1. Find the byte offset of the email match in the source HTML.
    //   2. Look 800 bytes BACK from that offset for the closest preceding
    //      <h1|h2|h3|h4|strong|b|title> tag whose text content looks like a
    //      person name (2–4 capitalised tokens, no digits, no @, ≤ 80 chars).
    //   3. If nothing found backwards, look 400 bytes FORWARD for the same.
    //   4. If nothing found, return name="" — never invent.
    //
    // We deliberately do NOT use a DOM parser — the function has to run in
    // the service worker AND the CLI without bringing in jsdom/cheerio.

    var _NAME_TAG_RE = /<(h1|h2|h3|h4|strong|b|title)\b[^>]*>([\s\S]{1,400}?)<\/\1>/gi;
    // A "person name" is 2–4 capitalised tokens. Allows hyphens (Anne-Marie),
    // apostrophes (O'Brien), and Unicode letters via property escapes, with
    // a fallback for older runtimes.
    var _PERSON_NAME_RE;
    try {
        _PERSON_NAME_RE = /^[\p{Lu}][\p{L}'\-]+(?:\s+[\p{Lu}][\p{L}'\-]+){1,3}$/u;
    } catch (e) {
        _PERSON_NAME_RE = /^[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,3}$/;
    }

    // Map of HTML entities we want to decode in a SINGLE pass. Doing this
    // sequentially (e.g. decoding `&amp;` first and then `&lt;`) introduces
    // a double-unescape vulnerability: the input `&amp;lt;` would first
    // become `&lt;` and then `<`. The single-pass replace below avoids
    // that because once a substitution has happened the resulting `&` is
    // not re-scanned by the same replace() call.
    var _HTML_ENTITIES = {
        'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", 'nbsp': ' '
    };
    function _stripTags(html) {
        return String(html || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&(#?\w+);/g, function (match, name) {
                if (_HTML_ENTITIES.hasOwnProperty(name.toLowerCase())) {
                    return _HTML_ENTITIES[name.toLowerCase()];
                }
                if (name.charAt(0) === '#') {
                    var code = name.charAt(1) === 'x' || name.charAt(1) === 'X'
                        ? parseInt(name.substring(2), 16)
                        : parseInt(name.substring(1), 10);
                    if (isFinite(code) && code > 0 && code <= 0x10FFFF) {
                        try { return String.fromCodePoint(code); } catch (e) { return ' '; }
                    }
                }
                return ' ';
            })
            .replace(/\s+/g, ' ')
            .trim();
    }

    function _looksLikeName(text) {
        if (!text) return false;
        if (text.length < 4 || text.length > 80) return false;
        if (text.indexOf('@') !== -1) return false;
        if (/\d/.test(text)) return false;
        // Reject all-caps shouting and obvious non-name strings
        if (text === text.toUpperCase() && text.length > 6) return false;
        if (/\b(login|sign\s*up|home|contact|about|services|menu|search|copyright|privacy|terms)\b/i.test(text)) return false;
        return _PERSON_NAME_RE.test(text);
    }

    /**
     * Find the closest plausible person name to a given offset in HTML.
     * Returns "" when no candidate clears the heuristic.
     */
    function _findNameNear(html, emailOffset) {
        if (!html || typeof emailOffset !== 'number') return '';
        var BACK_WINDOW = 800;
        var FWD_WINDOW = 400;
        var start = Math.max(0, emailOffset - BACK_WINDOW);
        var end   = Math.min(html.length, emailOffset + FWD_WINDOW);
        var slice = html.substring(start, end);
        var emailRel = emailOffset - start;

        var candidates = [];
        _NAME_TAG_RE.lastIndex = 0;
        var m;
        while ((m = _NAME_TAG_RE.exec(slice)) !== null) {
            var name = _stripTags(m[2]);
            if (!_looksLikeName(name)) continue;
            // Distance from the email position. Prefer preceding tags,
            // then the closest following tag.
            var tagEnd = m.index + m[0].length;
            var distance;
            if (tagEnd <= emailRel) distance = emailRel - tagEnd;       // before
            else if (m.index >= emailRel) distance = m.index - emailRel + 200; // after, slight penalty
            else distance = 0;                                          // overlap (rare)
            candidates.push({ name: name, distance: distance });
            if (m.index === _NAME_TAG_RE.lastIndex) _NAME_TAG_RE.lastIndex++;
        }
        if (!candidates.length) return '';
        candidates.sort(function (a, b) { return a.distance - b.distance; });
        return candidates[0].name;
    }

    /**
     * Like extractEmails(text), but takes the original HTML and attaches a
     * `name` field to each result by scanning the DOM neighbourhood for a
     * likely person-name heading.
     *
     * @param {string} html - Raw HTML to scan.
     * @param {Object} [options] - Same options as extractEmails().
     * @returns {Array<{email, name, source, confidence, validation, offset}>}
     */
    EmailExtractor.extractEmailsWithContext = function (html, options) {
        options = options || {};
        if (!html || typeof html !== 'string') return [];

        // First pass: full HTML-aware extraction (Cloudflare cfemail, CSS
        // ::before/::after content, RTL-reversed text, fragmented split
        // spans, <script> bodies, plus the standard text-regex run over an
        // inline-preserving tag-strip).
        var results = EmailExtractor.extractFromHtml(html, options);

        // Second pass: for each unique email, find its FIRST occurrence in
        // the original HTML (case-insensitive) and attach a nearby name.
        var lcHtml = html.toLowerCase();
        results.forEach(function (r) {
            // Role-based addresses (info@, sales@, etc.) are inherently
            // generic — never invent an "owner" for them.
            if (r.validation && r.validation.reason === 'Role-based email') {
                r.name = '';
                r.offset = -1;
                return;
            }
            var off = lcHtml.indexOf(r.email);
            if (off === -1) {
                // The email was reconstructed from an obfuscated pattern
                // (e.g. "user [at] domain dot com"). Try the local part.
                var local = r.email.split('@')[0];
                off = lcHtml.indexOf(local);
            }
            r.offset = off;
            r.name = off >= 0 ? _findNameNear(html, off) : '';
            // Boost confidence slightly when a strong nearby name is found.
            if (r.name) r.confidence = Math.min(100, r.confidence + 5);
        });
        return results;
    };

    // Expose helpers for callers that want to do their own neighbourhood
    // scans (e.g. the CLI's deep-scan layer that already has the HTML).
    EmailExtractor._findNameNear = _findNameNear;
    EmailExtractor._looksLikeName = _looksLikeName;

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
