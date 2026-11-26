// The home's "Not now? Send it to your group for tonight" line (src/app/pages/landing/tonight-line.ts):
// for a visitor who never played, under Start on the phone and computer homes, a wa.me link to the
// home in the visitor's language, tagged home-tonight-he or home-tonight-en, counted like the other
// WhatsApp buttons. Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');
const landing = path.join(app, 'pages', 'landing');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const line = load(path.join(landing, 'tonight-line.ts'));
const door = load(path.join(landing, 'front-door.ts'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

/** The text a wa.me link sends. */
function sent(href) {
    const m = /^https:\/\/wa\.me\/\?text=(.*)$/.exec(href);
    assert.ok(m, href);
    return decodeURIComponent(m[1]);
}

test('the link goes to the home in the visitor\'s language, with its own tag', () => {
    assert.strictEqual(line.tonightLink('he'), 'https://bullshit.wtf/he?via=home-tonight-he');
    assert.strictEqual(line.tonightLink('en'), 'https://bullshit.wtf/?via=home-tonight-en');
    // Anything that isn't Hebrew is the English home.
    assert.strictEqual(line.tonightLink(undefined), 'https://bullshit.wtf/?via=home-tonight-en');
});

test('WhatsApp gets a short message, then the link on its own line', () => {
    for (const lang of ['he', 'en']) {
        const text = sent(line.tonightHref(lang));
        const [message, link] = text.split('\n');
        assert.strictEqual(message, line.tonightStrings(lang).message);
        assert.strictEqual(link, line.tonightLink(lang));
        assert.ok(message.length <= 140, `${lang} message is short: ${message.length}`);
    }
    assert.match(line.tonightStrings('he').message, /[֐-׿]/);
    assert.strictEqual(line.tonightStrings('en').line, 'Not now? Send it to your group for tonight');
    assert.match(line.tonightStrings('he').line, /^לא עכשיו\? שלחו לקבוצה/);
});

test('the tags are the ones a play-test and the counts tell apart', () => {
    assert.deepStrictEqual(line.TONIGHT_TAGS, { he: 'home-tonight-he', en: 'home-tonight-en' });
    // Not a play-test tag (test, test-<name>): these visits count.
    for (const tag of Object.values(line.TONIGHT_TAGS)) {
        assert.doesNotMatch(tag, /^test(-|$)/);
    }
});

test('only a browser that never played sees it', () => {
    const visitor = (stored) => door.readVisitor(key => (key in stored ? stored[key] : null), null);
    assert.strictEqual(line.showTonight(visitor({})), true);
    assert.strictEqual(line.showTonight(visitor({ BS_PLAYER: JSON.stringify({ pid: 'p', uid: 'u' }) })), false);
    assert.strictEqual(line.showTonight(visitor({ BS_HOST_KEYS: JSON.stringify({ ABCD: 'k' }) })), false);
    assert.strictEqual(line.showTonight(visitor({ BS_CREWS: JSON.stringify([{ id: 'c' }]) })), false);
    assert.strictEqual(line.showTonight(null), true);
});

test('a press is counted as a row the server already takes, marked apart from lobby invites', () => {
    const analytics = read(__dirname, '..', '..', 'functions', 'src', 'controllers', 'analytics.ts');
    const methods = /'invite':\s*\[([^\]]*)\]/.exec(analytics);
    assert.ok(methods, 'SHARE_METHODS has invite');
    assert.match(methods[1], new RegExp(`'${line.TONIGHT_SHARE.method}'`));
    assert.strictEqual(line.TONIGHT_SHARE.content, 'invite');
    // cleanShare keeps a crew of 1 to 32 letters and digits for this content type.
    assert.match(line.TONIGHT_SHARE.crew, /^[a-z0-9]{1,32}$/);
});

test('both homes show it under Start, and only the phone home\'s picture branch (never played) has it', () => {
    const phone = read(landing, 'mobile-landing', 'mobile-landing.component.html');
    const computer = read(landing, 'desktop-landing', 'desktop-landing.component.html');
    for (const html of [phone, computer]) {
        assert.match(html, /class="tonight-line"[^>]*\[href\]="tonightHref"[^>]*target="_blank"/);
        assert.match(html, /\(click\)="tonightSent\(\)"/);
    }
    assert.match(computer, /class="tonight-line" \*ngIf="tonightShown"/);
    // The phone: under Start in the create template, only on the never-played branch (picture), and a
    // copy under Join Game that only a short phone shows (the scss).
    const create = phone.slice(phone.indexOf('<ng-template #create>'), phone.indexOf('</ng-template>', phone.indexOf('<ng-template #create>')));
    assert.ok(create.indexOf('tonight_line; context: { low: false }') > create.indexOf('menu-button create-game'));
    assert.match(create, /\*ngIf="picture && tonightShown"><ng-container \*ngTemplateOutlet="tonight_line; context: \{ low: false \}"/);
    const pictureBranch = phone.slice(phone.indexOf('<ng-container *ngIf="picture">'), phone.indexOf('<ng-container *ngIf="!picture">'));
    assert.ok(pictureBranch.indexOf('tonight_line; context: { low: true }') > pictureBranch.indexOf('ngTemplateOutlet="join"'));
    assert.strictEqual((phone.match(/tonight_line; context/g) || []).length, 2);
    const scss = read(landing, 'mobile-landing', 'mobile-landing.component.scss');
    const short = scss.slice(scss.indexOf('@media (max-height: 600px)'));
    assert.match(short, /\.home \.tonight-line \{\s*display: none;/);
    assert.match(short, /\.home \.tonight-line\.is-low \{\s*display: block;/);
    assert.ok(computer.indexOf('tonight-line') > computer.indexOf('class="host-button"'));
    assert.ok(computer.indexOf('tonight-line') < computer.indexOf('class="other-ways"'));
});

test('no game screen has it', () => {
    const pages = path.join(app, 'pages');
    for (const dir of fs.readdirSync(pages)) {
        if (dir === 'landing') {
            continue;
        }
        const full = path.join(pages, dir);
        if (!fs.statSync(full).isDirectory()) {
            continue;
        }
        for (const file of fs.readdirSync(full)) {
            if (file.endsWith('.html')) {
                assert.doesNotMatch(read(full, file), /tonight-line/, `${dir}/${file}`);
            }
        }
    }
});
