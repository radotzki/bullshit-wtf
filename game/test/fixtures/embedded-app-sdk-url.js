// A copy of the URL rewrite of Discord's Embedded App SDK, @discord/embedded-app-sdk 2.5.0
// (output/utils/url.mjs, and attemptRemap from output/utils/patchUrlMappings.mjs), unchanged but for
// the module wrapper and the window parameter. discord-proxy.test.js checks the game's own rewrite
// (src/discord/proxy.ts) against it. Kept as a copy rather than a dependency: the package pulls in a
// zod version with a high advisory, which audit.yml rightly refuses for a test.
//
// MIT License, Copyright (c) 2024 Discord Inc.
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
// NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
// OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
'use strict';

const SUBSTITUTION_REGEX = /\{([a-z]+)\}/g;
function regexFromTarget(target) {
    const regexString = target.replace(SUBSTITUTION_REGEX, (match, name) => `(?<${name}>[\\w-]+)`);
    return new RegExp(`${regexString}(/|$)`);
}
/**
 *
 * Attempts to map the actual url (i.e. google.com) to a url path, per the url
 * mappings set up in the embedded application. If the target contains `{foo}`
 * tokens, they will be replace with the values contained in the original URL,
 * via the pattern described in the prefix
 *
 * @returns  null if URL doesn't match prefix, otherwise return rewritten URL
 */
function matchAndRewriteURL({ originalURL, prefix, prefixHost, target }) {
    // coerce url with filler https protocol so we can retrieve host and pathname from target
    const targetURL = new URL(`https://${target}`);
    // Depending on the environment, the URL constructor may turn `{` and `}` into `%7B` and `%7D`, respectively
    const targetRegEx = regexFromTarget(targetURL.host.replace(/%7B/g, '{').replace(/%7D/g, '}'));
    const match = originalURL.toString().match(targetRegEx);
    // Null match indicates that this target is not relevant
    if (match == null)
        return originalURL;
    const newURL = new URL(originalURL.toString());
    newURL.host = prefixHost;
    newURL.pathname = prefix.replace(SUBSTITUTION_REGEX, (_, matchName) => {
        var _a;
        const replaceValue = (_a = match.groups) === null || _a === void 0 ? void 0 : _a[matchName];
        if (replaceValue == null)
            throw new Error('Misconfigured route.');
        return replaceValue;
    });
    // Append the original path
    const pathToAppend = originalURL.pathname.startsWith('/') ? originalURL.pathname.slice(1) : originalURL.pathname;
    newURL.pathname += newURL.pathname.endsWith('/') ? pathToAppend : '/' + pathToAppend;
    // Remove the target's path from the new url path
    newURL.pathname = newURL.pathname.replace(targetURL.pathname, '');
    // Add a trailing slash if original url had it, and if it doesn't already have one or if matches filename regex
    if (originalURL.pathname.endsWith('/') && !newURL.pathname.endsWith('/')) {
        newURL.pathname += '/';
    }
    return newURL;
}


/** attemptRemap, with the page's window passed in. */
function attemptRemap({ url, mappings }, window) {
    const newURL = new URL(url.toString());
    for (const mapping of mappings) {
        const mapped = matchAndRewriteURL({
            originalURL: newURL,
            prefix: mapping.prefix,
            target: mapping.target,
            prefixHost: window.location.host,
        });
        if (mapped != null && (mapped === null || mapped === void 0 ? void 0 : mapped.toString()) !== url.toString()) {
            return mapped;
        }
    }
    return newURL;
}

module.exports = { attemptRemap, matchAndRewriteURL };
