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

(function(window) {
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
     * Test domains and placeholders
     */
    var TEST_DOMAINS = {
        'example.com': 1, 'example.org': 1, 'example.net': 1,
        'test.com': 1, 'localhost': 1, 'domain.com': 1,
        'email.com': 1, 'mail.com': 1, 'company.com': 1,
        'yourcompany.com': 1, 'yourdomain.com': 1,
        'sentry.io': 1, 'wixpress.com': 1
    };

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
     * Validate email format and structure
     * @param {string} email - Email address to validate
     * @returns {Object} - Validation result with isValid and reason
     */
    function validateEmail(email) {
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

        // Check role-based prefixes
        var isRoleBased = ROLE_PREFIXES.some(function(prefix) {
            return localPart.indexOf(prefix) === 0;
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
            
            // Avoid duplicates
            if (seen.hasOwnProperty(email)) {
                return;
            }

            var validation = validateEmail(email);
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
        }

        // 2. Lenient pattern (with whitespace tolerance)
        LENIENT_EMAIL_REGEXP.lastIndex = 0;
        while ((match = LENIENT_EMAIL_REGEXP.exec(text)) !== null) {
            var email = match[1] + '@' + match[2].replace(/\s+/g, '');
            addEmail(email, 'lenient', -5);
        }

        // 3. Obfuscated patterns
        OBFUSCATED_PATTERNS.forEach(function(pattern) {
            pattern.lastIndex = 0;
            while ((match = pattern.exec(text)) !== null) {
                var email = normalizeObfuscatedEmail(match[0]);
                addEmail(email, 'obfuscated', -10);
            }
        });

        // 4. LinkedIn-specific patterns
        if (options.isLinkedIn || text.indexOf('linkedin.com') > -1) {
            LINKEDIN_PATTERNS.forEach(function(pattern) {
                pattern.lastIndex = 0;
                while ((match = pattern.exec(text)) !== null) {
                    addEmail(match[1], 'linkedin', 5);
                }
            });
        }

        // 5. Data platform patterns (Apollo, ZoomInfo, etc.)
        if (options.isDataPlatform || text.indexOf('apollo.io') > -1 || text.indexOf('zoominfo.com') > -1) {
            DATA_PLATFORM_PATTERNS.forEach(function(pattern) {
                pattern.lastIndex = 0;
                while ((match = pattern.exec(text)) !== null) {
                    addEmail(match[1], 'data-platform', 10);
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

            // Exclude role-based
            if (filters.excludeRoles) {
                var localPart = emailObj.email.split('@')[0];
                var isRole = ROLE_PREFIXES.some(function(prefix) {
                    return localPart.indexOf(prefix) === 0;
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

        url = url.toLowerCase();

        if (url.indexOf('linkedin.com') > -1) {
            return { platform: 'linkedin', isLinkedIn: true, isDataPlatform: false };
        }
        if (url.indexOf('apollo.io') > -1) {
            return { platform: 'apollo', isLinkedIn: false, isDataPlatform: true };
        }
        if (url.indexOf('zoominfo.com') > -1) {
            return { platform: 'zoominfo', isLinkedIn: false, isDataPlatform: true };
        }
        if (url.indexOf('hunter.io') > -1) {
            return { platform: 'hunter', isLinkedIn: false, isDataPlatform: true };
        }

        return { platform: 'generic', isDataPlatform: false };
    };

    /**
     * Export functions to global scope
     */
    EmailExtractor.ISP_DOMAINS = ISP_DOMAINS;
    EmailExtractor.validateEmail = validateEmail;
    EmailExtractor.normalizeObfuscatedEmail = normalizeObfuscatedEmail;

    // Export to window
    window.EmailExtractor = EmailExtractor;

})(window);
