// The privacy page (scripts/build-privacy.js) and the CrazyGames version's two fixes against
// CrazyGames' rules: a privacy link on the portal's home, and no kids' questions offered there.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const { PRIVACY, ISSUES } = require('../scripts/privacy-text');
const { render } = require('../scripts/build-privacy');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const portal = load(path.join(root, 'src', 'app', 'portal', 'portal.ts'));

test('the build writes /privacy and /he/privacy, twins of each other', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-'));
    execFileSync(process.execPath, [path.join(root, 'scripts', 'build-privacy.js'), out]);
    const en = fs.readFileSync(path.join(out, 'privacy.html'), 'utf8');
    const he = fs.readFileSync(path.join(out, 'he', 'privacy.html'), 'utf8');
    assert.match(en, /<html lang="en" dir="ltr"/);
    assert.match(he, /<html lang="he" dir="rtl"/);
    assert.match(en, /href="\/he\/privacy"/);
    assert.match(he, /href="\/privacy"/);
    assert.strictEqual(PRIVACY.en.sections.length, PRIVACY.he.sections.length);
    PRIVACY.en.sections.forEach((s, i) => {
        const h = PRIVACY.he.sections[i];
        assert.strictEqual(!!s.list, !!h.list, s.h);
        assert.strictEqual((s.list || []).length, (h.list || []).length, s.h);
    });
});

test('the privacy page has no way into the game: its only links are the other language and the questions page', () => {
    for (const lang of ['en', 'he']) {
        const html = render(PRIVACY[lang]);
        const hrefs = Array.from(html.matchAll(/<a [^>]*href="([^"]*)"/g)).map(m => m[1]);
        assert.deepStrictEqual(hrefs.sort(), [PRIVACY[lang].other.href, ISSUES].sort(), lang);
        // No visit beacon, no scripts at all.
        assert.doesNotMatch(html, /<script/i, lang);
    }
});

test('the privacy page says what the join keeps, and the words the code backs', () => {
    const all = (t) => [t.intro].concat(...t.sections.map(s => (s.p || []).concat(s.list || []))).join(' ');
    const en = all(PRIVACY.en);
    for (const fact of [/IP address/, /user agent/, /random id/, /game night/, /said they're in/, /nickname/, /Sentry/, /Google Fonts/, /BootstrapCDN/, /nine days/, /CrazyGames/]) {
        assert.match(en, fact);
    }
    const he = all(PRIVACY.he);
    for (const fact of [/IP/, /user agent/, /המזהה האקראי/, /ערב המשחק הבא/, /Sentry/, /Google Fonts/, /BootstrapCDN/, /תשעה ימים/, /CrazyGames/]) {
        assert.match(he, fact);
    }
    // The join keeps exactly these (functions/src/controllers/analytics.ts onJoinGame).
    const analytics = fs.readFileSync(path.join(root, '..', 'functions', 'src', 'controllers', 'analytics.ts'), 'utf8');
    assert.match(analytics, /insert\('users', \{[^}]*\bip,\s*useragent,\s*pin,\s*nickname,\s*via,/);
    // An error report names the browser's id and the game: say so where the page speaks of Sentry.
    const errors = (t) => t.sections.find(x => /Sentry/.test((x.p || []).join(' '))).p.join(' ');
    assert.match(errors(PRIVACY.en), /random id.*game's code.*IP address/);
    assert.match(errors(PRIVACY.he), /המזהה האקראי.*קוד המשחק.*IP/);
    assert.match(fs.readFileSync(path.join(root, 'src', 'app', 'services', 'session.service.ts'), 'utf8'), /setSentryUser\(\{ id: user\.uid \}\)/);
    // A crew keeps its next night and who said "I'm in" (game-model CrewNight).
    assert.match(fs.readFileSync(path.join(root, '..', 'game-model.ts'), 'utf8'), /export interface CrewNight \{\s*time: number;\s*by\?: string;\s*in\?:/);
    // A visit keeps no IP (functions/src/controllers/visit.ts).
    assert.match(fs.readFileSync(path.join(root, '..', 'functions', 'src', 'controllers', 'visit.ts'), 'utf8'), /No IP, no user agent/);
});

test('the privacy pages are served by cleanUrls and stay out of the sitemap', () => {
    const hosting = JSON.parse(fs.readFileSync(path.join(root, '..', 'firebase.json'), 'utf8')).hosting;
    assert.strictEqual(hosting.cleanUrls, true);
    for (const r of hosting.rewrites) {
        const re = r.regex ? new RegExp(r.regex) : null;
        assert.ok(!(re && (re.test('/privacy') || re.test('/he/privacy'))), JSON.stringify(r));
    }
    const pages = require('../seo/pages');
    assert.ok(!pages.some(p => /privacy/.test(p.path)));
    assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /node scripts\/build-privacy\.js/);
});

test('the portal\'s home links to the privacy page in its language, and the link may open', () => {
    const base = 'https://bullshit.wtf/portal/crazygames?via=portal-crazygames#/';
    assert.strictEqual(portal.portalHomeStrings('en').privacyHref, '/privacy');
    assert.strictEqual(portal.portalHomeStrings('he').privacyHref, '/he/privacy');
    for (const lang of ['en', 'he']) {
        const p = portal.portalHomeStrings(lang);
        assert.ok(p.privacy.length > 0, lang);
        assert.strictEqual(portal.blockedLink(p.privacyHref, base), false, lang);
    }
    assert.strictEqual(portal.blockedLink('https://bullshit.wtf/privacy', base), false);
    // Only the privacy page: the rest of the site stays blocked, and so does another site's privacy page.
    for (const out of ['/privacy?via=x', '/privacy/more', '/privacy-games', '/he/privacy/x', 'https://example.com/privacy', '/']) {
        assert.strictEqual(portal.blockedLink(out, base), true, out);
    }
    const home = fs.readFileSync(path.join(root, 'src', 'app', 'portal', 'portal-home.component.ts'), 'utf8');
    assert.match(home, /class="portal-privacy" \[attr\.href\]="p\.privacyHref" target="_blank" rel="noopener"/);
});

test('the portal offers no kids\' questions: not on its home, not on its create page; the main site keeps them', () => {
    for (const lang of ['en', 'he']) {
        const p = portal.portalHomeStrings(lang);
        assert.doesNotMatch(p.options, /kids|ילדים/i, lang);
    }
    const html = fs.readFileSync(path.join(root, 'src', 'app', 'pages', 'create-game', 'create-game.component.html'), 'utf8');
    const box = /<ng-container \*ngIf="!portal">\s*<label>\{\{ t\.players \}\}<\/label>[\s\S]*?name="kids"[\s\S]*?kidsNote[\s\S]*?<\/ng-container>/;
    assert.match(html, box);
    const cmp = fs.readFileSync(path.join(root, 'src', 'app', 'pages', 'create-game', 'create-game.component.ts'), 'utf8');
    assert.match(cmp, /readonly portal = inPortal\(\);/);
    assert.match(cmp, /this\.kids = !this\.portal && params\.pack === KIDS_PACK;/);
});
