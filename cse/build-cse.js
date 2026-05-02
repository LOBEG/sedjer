#!/usr/bin/env node
/**
 * cse/build-cse.js
 *
 * Generate a Google Programmable Search Engine ("CSE") annotation bundle
 * from the 1062 built-in footprints baked into background/api.js. Each
 * unique `site:DOMAIN` referenced by any footprint becomes a boost/include
 * site so the resulting CSE returns lead-gen-relevant results first.
 *
 * Outputs (re-runnable, idempotent):
 *   cse/paris-cse-annotations.xml   ← drop into "Advanced → Import" in
 *                                     https://programmablesearchengine.google.com
 *   cse/cse-config.json             ← machine-readable copy
 *
 * Usage:
 *   node cse/build-cse.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

// ─── Pull _builtinFootprints out of background/api.js ──────────────────────
function loadFootprints() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'background', 'api.js'), 'utf8');
    var start = src.indexOf('var _builtinFootprints');
    if (start < 0) throw new Error('_builtinFootprints not found in background/api.js');
    var open = src.indexOf('[', start);
    var i = open, depth = 0, inStr = null, esc = false, inLine = false, inBlock = false;
    while (i < src.length) {
        var ch = src[i], nx = src[i + 1];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === inStr) inStr = null;
        } else if (inLine) {
            if (ch === '\n') inLine = false;
        } else if (inBlock) {
            if (ch === '*' && nx === '/') { inBlock = false; i++; }
        } else {
            if (ch === '/' && nx === '/') { inLine = true; i++; }
            else if (ch === '/' && nx === '*') { inBlock = true; i++; }
            else if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
            else if (ch === '[') depth++;
            else if (ch === ']') { depth--; if (depth === 0) { i++; break; } }
        }
        i++;
    }
    /* eslint-disable no-new-func */
    return Function('"use strict";return (' + src.substring(open, i) + ');')();
}

// ─── Pull every site: domain reference out of every footprint query ────────
function extractSites(footprints) {
    var sites = Object.create(null);
    // Match `site:host` and `-site:host` (the leading `-` excludes from
    // search; we still want to know about it but mark it differently).
    // We accept both `linkedin.com/in/` style (path qualifier) and bare
    // hostnames. Pure-TLD restrictions like `site:.us` are skipped.
    var siteRe = /(?:^|[\s(])(-)?site:([A-Za-z0-9*][A-Za-z0-9*.\-]*\.[A-Za-z][A-Za-z0-9-]*)(?:\/[A-Za-z0-9_\-/.]*)?/g;
    footprints.forEach(function (fp) {
        // Footprint shape: { name, value } where `value` is a newline-joined
        // string of one OR MORE search queries. There's no `queries` array.
        var raw = (fp && (fp.value || fp.queries || fp.query)) || '';
        var queryString = Array.isArray(raw) ? raw.join('\n') : String(raw);
        siteRe.lastIndex = 0;
        var m;
        while ((m = siteRe.exec(queryString)) !== null) {
            var negated = !!m[1];
            var d = m[2].replace(/^\*\./, '').toLowerCase();
            // Skip wildcards we can't represent in CSE annotations
            if (d.indexOf('*') !== -1) continue;
            // Skip pure-TLD restrictions like ".us" / ".co.uk" — these
            // start with a dot and have no real hostname before it.
            if (d.charAt(0) === '.') continue;
            // Skip if domain has no labels before its TLD (defensive)
            if (d.split('.').filter(Boolean).length < 2) continue;
            if (negated) {
                // record but don't override an include
                if (!sites[d]) sites[d] = 'exclude';
            } else {
                sites[d] = 'include';
            }
        }
    });
    var include = [], exclude = [];
    Object.keys(sites).sort().forEach(function (d) {
        if (sites[d] === 'include') include.push(d);
        else exclude.push(d);
    });
    return { include: include, exclude: exclude };
}

// Curated **exclusion** list — sites that historically pollute lead-gen
// SERPs (lyrics, movies, link-farms, content-mill aggregators). These get
// emitted as `_exclude_` annotations so the CSE deprioritises them even
// when they happen to mention a target domain.
var EXCLUDE_SITES = [
    // NOTE: any site that is ALSO referenced by a built-in footprint will be
    // automatically dropped from the final exclude list (include wins). Don't
    // list lead-gen platforms here even if they're noisy in some queries —
    // the footprint author already decided they were valuable.
    'pinimg.com',
    'flickr.com',
    'imdb.com',
    'rottentomatoes.com',
    'lyrics.com',
    'azlyrics.com',
    'genius.com',
    'songlyrics.com',
    'metrolyrics.com',
    'urbandictionary.com',
    'tripadvisor.com',
    'yelp.com',
    'wikihow.com',
    'answers.com',
    'ehow.com',
    'about.com',
    'examiner.com',
    'buzzfeed.com',
    'dailymotion.com',
    'wattpad.com',
    'fanfiction.net',
    'archive.org',
    'web.archive.org'
];

function xmlEscape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildXml(includeSites, excludeSites) {
    var includeAnnotations = includeSites.map(function (d) {
        return '  <Annotation about="' + xmlEscape(d) + '/*" score="1">'
             + '<Label name="_include_"/>'
             + '<Label name="paris_leadgen"/>'
             + '</Annotation>';
    }).join('\n');
    var excludeAnnotations = excludeSites.map(function (d) {
        return '  <Annotation about="' + xmlEscape(d) + '/*" score="0">'
             + '<Label name="_exclude_"/>'
             + '</Annotation>';
    }).join('\n');

    return [
        '<?xml version="1.0" encoding="UTF-8" ?>',
        '<!--',
        '  Paris Email Extractor — Google Programmable Search Engine bundle',
        '  Auto-generated from background/api.js — DO NOT EDIT BY HAND.',
        '  Re-run `node cse/build-cse.js` to refresh after footprints change.',
        '-->',
        '<GoogleCustomizations>',
        '  <CustomSearchEngine id="paris-leadgen" creator="paris-email-extractor" volunteers="" language="en" encoding="utf-8" enable_suggest="true" safesearch="false">',
        '    <Title>Paris Lead-Gen Engine</Title>',
        '    <Description>Tuned for B2B email discovery — boosts LinkedIn, Apollo, ZoomInfo, RocketReach, Crunchbase, Wellfound, SignalHire, GitHub, Substack, country/city directories and 1000+ other professional sources.</Description>',
        '    <Context>',
        '      <BackgroundLabels>',
        '        <Label name="_cse_paris-leadgen" mode="FILTER"/>',
        '        <Label name="_include_" mode="BOOST"/>',
        '        <Label name="_exclude_" mode="ELIMINATE"/>',
        '      </BackgroundLabels>',
        '    </Context>',
        '  </CustomSearchEngine>',
        '  <Annotations>',
        includeAnnotations,
        excludeAnnotations,
        '  </Annotations>',
        '</GoogleCustomizations>',
        ''
    ].join('\n');
}

function main() {
    var fps = loadFootprints();
    var found = extractSites(fps);
    var includeSites = found.include;
    // Merge curated exclusions with footprint-derived exclusions, dedup,
    // remove anything that is ALSO in the include list (include wins).
    var excludeSet = Object.create(null);
    EXCLUDE_SITES.forEach(function (d) { excludeSet[d.toLowerCase()] = true; });
    found.exclude.forEach(function (d) { excludeSet[d] = true; });
    var includeSet = Object.create(null);
    includeSites.forEach(function (d) { includeSet[d] = true; });
    var excludeSites = Object.keys(excludeSet)
        .filter(function (d) { return !includeSet[d]; })
        .sort();

    var jsonOut = {
        name: 'Paris Lead-Gen Engine',
        description: 'Programmable Search Engine tuned for Paris Email Extractor — boosts results from professional networks, lead-gen platforms, and business directories.',
        generatedAt: new Date().toISOString(),
        totalFootprints: fps.length,
        totalIncludeSites: includeSites.length,
        totalExcludeSites: excludeSites.length,
        includeSites: includeSites,
        excludeSites: excludeSites
    };

    var outDir = path.join(__dirname);
    fs.writeFileSync(path.join(outDir, 'cse-config.json'), JSON.stringify(jsonOut, null, 2));
    fs.writeFileSync(path.join(outDir, 'paris-cse-annotations.xml'), buildXml(includeSites, excludeSites));

    process.stdout.write(
        'Wrote cse/cse-config.json and cse/paris-cse-annotations.xml\n' +
        '  Footprints scanned : ' + fps.length + '\n' +
        '  Include sites      : ' + includeSites.length + '\n' +
        '  Exclude sites      : ' + excludeSites.length + '\n'
    );
}

if (require.main === module) main();
