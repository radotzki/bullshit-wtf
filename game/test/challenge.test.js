// Tests for CHALLENGE ANOTHER GROUP on the site (src/app/components/challenge/challenge.ts): the link
// and its tag, the game's campaign, reading the server's card (only plain text and numbers get through),
// the side-by-side verdict, and the words in English and Hebrew. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

/** Loads a TypeScript file of the app, following its relative imports. */
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, lib: ['es2017', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const c = load(path.join(app, 'components', 'challenge', 'challenge.ts'));

const card = {
    from: 'QVAB', host: 'Noa', locale: 'en', questions: 7, played: 4, top: 6500,
    rows: [{ name: 'Dan', score: 6500, place: 1 }, { name: 'Noa', score: 5000, place: 2 }, { name: 'Maya', score: 5000, place: 2 },
        { name: 'Ron', score: 250, place: 4 }],
};

test('the link names the game by its PIN and carries the way it was sent as its via tag', () => {
    assert.strictEqual(c.challengeUrl('qvab', 'en', 'whatsapp'), 'https://bullshit.wtf/challenge/QVAB?via=challenge-whatsapp');
    assert.strictEqual(c.challengeUrl('QVAB', 'he', 'native'), 'https://bullshit.wtf/he/challenge/QVAB?via=challenge-share');
    assert.strictEqual(c.challengeUrl('QVAB', 'en', 'copy'), 'https://bullshit.wtf/challenge/QVAB?via=challenge-copy');
    // Every tag is a campaign the server keeps (cleanCampaign: a-z, 0-9 and dashes, 40 at most).
    for (const tag of Object.values(c.CHALLENGE_TAGS).concat([c.CHALLENGE_TAG, c.CHALLENGE_OVER_TAG])) {
        assert.match(tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
        assert.match(tag, /^challenge/);
    }
});

test('the game a challenge link makes is tagged by that link; a play-test stays a test', () => {
    assert.strictEqual(c.challengeCampaign('challenge-whatsapp'), 'challenge-whatsapp');
    assert.strictEqual(c.challengeCampaign('Challenge-Share'), 'challenge-share');
    assert.strictEqual(c.challengeCampaign('test'), 'test');
    assert.strictEqual(c.challengeCampaign('test-qa'), 'test-qa');
    assert.strictEqual(c.challengeCampaign(null), 'challenge');
    assert.strictEqual(c.challengeCampaign('fb-group'), 'challenge');
    assert.strictEqual(c.challengeCampaign('challenge"><script>'), 'challenge');
});

test('a card from the server is read as plain strings and numbers, or not at all', () => {
    const read = c.readCard(card);
    assert.deepStrictEqual(read, card);
    assert.strictEqual(c.readCard(null), null);
    assert.strictEqual(c.readCard({ ...card, from: 'qvab' }), null, 'a PIN is capitals');
    assert.strictEqual(c.readCard({ ...card, from: '<img>' }), null);
    assert.strictEqual(c.readCard({ ...card, top: '9999' }), null, 'a score is a number');
    assert.strictEqual(c.readCard({ ...card, top: Infinity }), null);
    assert.strictEqual(c.readCard({ ...card, questions: 0 }), null);
    assert.strictEqual(c.readCard({ ...card, rows: 'x' }), null);
    assert.strictEqual(c.readCard({ ...card, rows: [{ name: { toString: () => 'x' }, score: 1, place: 1 }] }), null);
    assert.strictEqual(c.readCard({ ...card, host: 7 }), null);
    // A long name is cut; markup is kept as the characters it is (the page shows text, never markup).
    const long = c.readCard({ ...card, host: 'x'.repeat(60), rows: [{ name: '<b>hi</b>', score: 1, place: 1 }] });
    assert.strictEqual(long.host.length, 24);
    assert.strictEqual(long.rows[0].name, '<b>hi</b>');
    assert.strictEqual(c.readCard({ ...card, locale: 'fr' }).locale, 'en');
    assert.strictEqual(c.readCard({ ...card, extra: 'x' }).extra, undefined);
    assert.strictEqual(c.readCard({ ...card, test: true }).test, true);
    // The server's challenge numbers are kept when they are plain numbers, dropped otherwise.
    assert.strictEqual(c.readCard({ ...card, average: 5100, ours: 4900 }).average, 5100);
    assert.strictEqual(c.readCard({ ...card, average: 5100, ours: 4900 }).ours, 4900);
    assert.strictEqual(c.readCard({ ...card, average: '5100' }).average, undefined);
    assert.strictEqual(c.readCard({ ...card, average: -1, ours: Infinity }).ours, undefined);
    assert.ok(!('average' in c.readCard(card)), 'an older card stays as it was');
});

// The card above, an older card with no challenge number: Dan 6500, Noa 5000, Maya 5000, Ron 250. Average 4188.
test('an older card: who won, by each table\'s plain average a player', () => {
    assert.strictEqual(c.tableAverage([6500, 5000, 5000, 250]), 4188);
    assert.strictEqual(c.tableAverage([]), 0);
    assert.strictEqual(c.tableAverage(null), 0);
    assert.strictEqual(c.tableAverage([-5, 'x', 10]), 3);
    assert.strictEqual(c.cardAverage(card), 4188);
    assert.strictEqual(c.cardAverage({ ...card, rows: [] }), 0);
    assert.deepStrictEqual(c.verdict(7000, 6500), { verdict: 'won', by: 500 });
    assert.deepStrictEqual(c.verdict(6000, 6500), { verdict: 'lost', by: 500 });
    assert.deepStrictEqual(c.verdict(6500, 6500), { verdict: 'tie', by: 0 });
    // A table of two averaging 4688 beats it by 500; one averaging 3688 loses by 500.
    assert.strictEqual(c.verdictLine([5000, 4376], card, 'en'), 'You beat Noa\'s table by 500 points a player!');
    assert.strictEqual(c.verdictLine([4000, 3376], card, 'en'), 'Noa\'s table wins by 500 points a player.');
    assert.strictEqual(c.verdictLine([4000, 3376], { ...card, host: '' }, 'en'), 'The other table wins by 500 points a player.');
    assert.strictEqual(c.verdictLine([5000, 4376], { ...card, host: '' }, 'en'), 'You beat the other table by 500 points a player!');
    assert.strictEqual(c.verdictLine([4188, 4188], card, 'en'), 'A dead heat: the same points a player!');
    assert.strictEqual(c.verdictLine([5000, 4376], card, 'he'), 'ניצחתם את השולחן של Noa ב-500 נקודות לשחקן!');
    assert.strictEqual(c.verdictLine([4000, 3376], { ...card, host: '' }, 'he'), 'השולחן השני ניצח ב-500 נקודות לשחקן.');
    assert.strictEqual(c.verdictLine([4188, 4188], card, 'he'), 'תיקו: אותן נקודות לשחקן בדיוק!');
    assert.strictEqual(c.sizesLine(2, card, 'en'), 'Judged by points a player · your table 2 players, theirs 4');
    assert.strictEqual(c.sizesLine(2, card, 'he'), 'לפי נקודות לשחקן · אצלכם 2 שחקנים, אצלם 4');
    assert.strictEqual(c.sizesLine(4, card, 'en'), '', 'the same size: no line');
    assert.strictEqual(c.houseCounted(card), false);
    // A card with the server's number but a server that sent none for this game: both sides plain averages.
    assert.strictEqual(c.ourAverage([5000, 4376], { ...card, average: 7000 }), 4688);
});

test('a card with the server\'s challenge numbers: both tables are judged by them, not by the rows', () => {
    // A pair that fell for house lies: its rows average 3800, its number (house lies counted) is 7400.
    const pair = { ...card, played: 2, rows: [{ name: 'Dan', score: 4600, place: 1 }, { name: 'Noa', score: 3000, place: 2 }],
        average: 7400 };
    assert.strictEqual(c.cardAverage(pair), 7400);
    assert.strictEqual(c.houseCounted(pair), true);
    assert.strictEqual(c.houseCounted(pair, true), false, 'the final screen needs this game\'s number too');
    assert.strictEqual(c.houseCounted({ ...pair, ours: 7200 }, true), true);
    // An eight with a plain average of 7200, which is its number too (no house lies at 5 and up).
    const eight = [9000, 8800, 8000, 7400, 7000, 6600, 6000, 4800];
    assert.strictEqual(c.ourAverage(eight, { ...pair, ours: 7200 }), 7200);
    assert.strictEqual(c.verdictLine(eight, { ...pair, ours: 7200 }, 'en'), 'Noa\'s table wins by 200 points a player.');
    assert.strictEqual(c.verdictLine(eight, { ...pair, ours: 7200 }, 'he'), 'השולחן של Noa ניצח ב-200 נקודות לשחקן.');
    // By the rows alone the eight would have won by 3400.
    assert.strictEqual(c.verdict(c.tableAverage(eight), c.tableAverage([4600, 3000])).by, 3400);
    // And the other way: a pair whose number is higher beats the eight.
    assert.match(c.verdictLine([4600, 3000], { ...card, played: 8, average: 7200, ours: 7400 }, 'en'), /^You beat Noa's table by 200 points a player!$/);
    assert.strictEqual(c.sizesLine(2, { ...card, played: 8 }, 'en'), 'Judged by points a player · your table 2 players, theirs 8');
});

test('the side-by-side scores show five rows of each table, and how many more', () => {
    assert.deepStrictEqual(c.topRows([1, 2, 3]), { rows: [1, 2, 3], more: 0 });
    assert.deepStrictEqual(c.topRows([1, 2, 3, 4, 5, 6, 7]), { rows: [1, 2, 3, 4, 5], more: 2 });
    assert.deepStrictEqual(c.topRows(null), { rows: [], more: 0 });
});

test('the words exist in both languages, the same keys, and the message quotes the score and the questions', () => {
    const en = c.challengeWords('en');
    const he = c.challengeWords('he');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    assert.strictEqual(c.challengeWords('fr'), en);
    assert.strictEqual(en.message(4188, 7), 'Our table: 4188 points a player at Bullshit. Same 7 questions — can your group beat that?');
    assert.strictEqual(he.message(4188, 7), 'השולחן שלנו: 4188 נקודות לשחקן בבולשיט. אותן 7 שאלות — החבורה שלכם תעבור את זה?');
    assert.strictEqual(en.houseNote, 'House lies count like a friend\'s lie, so small tables aren\'t punished.');
    assert.strictEqual(he.houseNote, 'שקרי הבית נספרים כמו שקר של חבר, כדי ששולחן קטן לא ייפגע.');
    assert.doesNotMatch(en.textPlain(7), /any size/i);
    // The Hebrew label under the big number keeps the wording that reads one way only.
    assert.match(he.toBeat, /הניקוד שצריך לעבור/);
    assert.doesNotMatch(he.toBeat, /לנצח/);
    assert.strictEqual(en.table('Noa', 4), 'Noa\'s table');
    assert.strictEqual(en.table('', 4), 'A table of 4');
    assert.strictEqual(he.table('', 4), 'שולחן של 4 שחקנים');
    for (const t of [en, he]) {
        for (const k of Object.keys(t)) {
            const v = typeof t[k] === 'function' ? t[k](3, 'x') : t[k];
            assert.ok(typeof v === 'string' && v.trim().length > 0, k);
        }
    }
    // Hebrew words in Hebrew letters (names and numbers aside).
    for (const k of ['button', 'title', 'start', 'label', 'us', 'overTitle']) {
        assert.match(he[k], /[֐-׿]/, k);
    }
});

test('the final screen offers the challenge to a table of two or more, and shows the scores side by side', () => {
    const html = fs.readFileSync(path.join(app, 'pages', 'score-board-final', 'score-board-final.component.html'), 'utf8');
    assert.match(html, /<app-challenge-share \*ngIf="!soloTaste && !taste && !idle && displayPlayers.length > 1"/);
    assert.match(html, /<app-challenge-versus \*ngIf="!soloTaste && !taste"/);
    // Names are interpolated as text, never bound as markup.
    for (const f of ['challenge-versus.component.html', 'challenge-share.component.html']) {
        assert.doesNotMatch(fs.readFileSync(path.join(app, 'components', 'challenge', f), 'utf8'), /innerHTML/);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(app, 'pages', 'challenge', 'challenge.component.html'), 'utf8'), /innerHTML/);
});

test('the challenge link is a page of the site in both languages, sent with no-cache and kept out of search', () => {
    const routes = fs.readFileSync(path.join(app, 'app-routing', 'app-routing.module.ts'), 'utf8');
    assert.match(routes, /path: 'challenge\/:pin', component: ChallengeComponent/);
    assert.match(routes, /path: 'he\/challenge\/:pin', component: ChallengeComponent/);
    const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firebase.json'), 'utf8')).hosting;
    const dest = p => {
        const r = hosting.rewrites.find(r => r.regex ? new RegExp(r.regex).test(p) : false);
        return r && (r.destination || r.function);
    };
    assert.strictEqual(dest('/challenge/QVAB'), '/index.html');
    assert.strictEqual(dest('/he/challenge/QVAB'), '/he.html');
    const headers = p => hosting.headers.filter(h => h.regex && new RegExp(h.regex).test(p))
        .reduce((all, h) => all.concat(h.headers.map(x => x.key + ': ' + x.value)), []);
    for (const p of ['/challenge/QVAB', '/he/challenge/QVAB']) {
        assert.ok(headers(p).includes('X-Robots-Tag: noindex'), p);
        assert.ok(headers(p).includes('Cache-Control: no-cache'), p);
    }
});
