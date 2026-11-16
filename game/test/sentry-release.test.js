// Tests that Sentry's errors name the release (the commit) the page was built from
// (src/app/sentry/release.ts and scripts/stamp-release.js). Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const dir = path.join(__dirname, '..', 'src', 'app', 'sentry');
const SHA = 'aa9d47a9c642e61ddeb64a86f74631b11f64d0c5';

function load() {
    const out = ts.transpileModule(fs.readFileSync(path.join(dir, 'release.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { readRelease } = load();
const { stamp, commit } = require('../scripts/stamp-release.js');

function page(content) {
    return {
        querySelector(selector) {
            assert.strictEqual(selector, 'meta[name="bs-release"]');
            return content === undefined ? null : { getAttribute: () => content };
        },
    };
}

test('the page tag gives the release', () => {
    assert.strictEqual(readRelease(page(SHA)), SHA);
});

test('no tag, no document or a strange value gives no release', () => {
    assert.strictEqual(readRelease(page(undefined)), undefined);
    assert.strictEqual(readRelease(null), undefined);
    assert.strictEqual(readRelease(undefined), undefined);
    assert.strictEqual(readRelease(page('')), undefined);
    assert.strictEqual(readRelease(page('<script>')), undefined);
    assert.strictEqual(readRelease({ querySelector() { throw new Error('blocked'); } }), undefined);
});

test('the build puts the tag after the charset, once, also when run twice', () => {
    const html = '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>x</title>\n</head></html>';
    const once = stamp(html, SHA);
    assert.match(once, new RegExp(`<meta charset="utf-8">\\n  <meta name="bs-release" content="${SHA}">\\n  <title>`));
    const twice = stamp(once, 'b'.repeat(40));
    assert.strictEqual((twice.match(/bs-release/g) || []).length, 1);
    assert.match(twice, /content="b{40}"/);
    assert.strictEqual(stamp(once, undefined), html);
});

test('the commit comes from the GitHub run when there is one', () => {
    assert.strictEqual(commit({ GITHUB_SHA: SHA }), SHA);
    const local = commit({ GITHUB_SHA: 'not-a-sha' });
    assert.ok(local === undefined || /^[0-9a-f]{40}$/.test(local));
});

test('the Sentry client is configured with the release from the page', () => {
    const src = fs.readFileSync(path.join(dir, 'sentry.module.ts'), 'utf8');
    assert.match(src, /release:\s*readRelease\(/);
    assert.match(src, /import \{ readRelease \} from '\.\/release';/);
});

test('the build stamps the page before the Hebrew page is made from it', () => {
    const build = require('../package.json').scripts.build;
    assert.match(build, /ng build && node scripts\/stamp-release\.js && node scripts\/build-he\.js/);
});
