// Every search page names the game in its title, so a search for the name plus a word
// ("bullshit game classroom", "בולשיט משחק לכיתה") matches it; the youth page carries its tagged
// counselor-to-counselor WhatsApp share; and no page still says the old 8-player limit.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const maxPlayers = +/export const MAX_PLAYERS = (\d+);/.exec(fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8'))[1];

test('every search title names the game and says what it is', () => {
    pages.forEach(p => {
        if (p.site.lang === 'he') {
            assert.match(p.title, /בולשיט/, p.path);
            assert.match(p.title, /משחק/, p.path);
        } else {
            assert.match(p.title, /Bullshit/, p.path);
            assert.match(p.title, /\bgames?\b/i, p.path);
        }
        assert.ok(p.title.length <= 60, `${p.path}: ${p.title.length} characters`);
    });
});

test('the youth page has a WhatsApp share tagged wa-he-madrichim', () => {
    const youth = pages.find(p => p.path === '/he/youth-group');
    const m = /href="https:\/\/wa\.me\/\?text=([^"]+)"/.exec(youth.body);
    assert.ok(m, 'a wa.me share link');
    const text = decodeURIComponent(m[1]);
    assert.match(text, /https:\/\/bullshit\.wtf\/he\/youth-group\?via=wa-he-madrichim$/);
    assert.match(text, new RegExp('עד ' + maxPlayers + ' במשחק'));
    assert.doesNotMatch(youth.body, /לשחק משחק אחד לבד/);
});

test('the school-break page has no line that goes stale after Hanukkah', () => {
    const page = pages.find(p => p.path === '/he/school-break');
    assert.doesNotMatch(page.body, /חנוכה מגיע/);
});

test('no page or share card still says the old 8-player limit', () => {
    const old = /up to 8 (players|phones)|8 phones at most|more than 8 people|עד 8 (שחקנים|טלפונים)/i;
    pages.forEach(p => {
        [p.title, p.description, p.body].forEach(s => assert.doesNotMatch(s, old, p.path));
    });
    ['more-pages.html', 'groups-home.html', 'search-pages.html', 'hanukkah.html'].forEach(f => {
        const file = path.join(root, 'graphics', f);
        if (fs.existsSync(file)) {
            assert.doesNotMatch(fs.readFileSync(file, 'utf8'), old, f);
        }
    });
});

test('the text of each home page, read without JavaScript, links every search page in its language', () => {
    const en = fs.readFileSync(path.join(root, 'game', 'src', 'index.html'), 'utf8');
    const he = fs.readFileSync(path.join(root, 'game', 'scripts', 'build-he.js'), 'utf8');
    const about = (s) => /<main id="bs-about"[\s\S]*?<\/main>/.exec(s)[0];
    pages.forEach(p => {
        const home = about(p.site.lang === 'he' ? he : en);
        assert.ok(home.includes(`href="${p.path}"`), p.path);
    });
});
