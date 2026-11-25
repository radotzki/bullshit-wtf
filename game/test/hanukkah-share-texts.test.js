// Tests for the texts a player sends from a Hanukkah game: every message the game hands a player
// to send says it is a Hanukkah game night, in Hebrew and English, with no question or truth in it,
// and every other game keeps its text word for word.
// - the results share (share.service.ts: resultsText, groupResultsText; share-results component);
// - CHALLENGE ANOTHER GROUP (challenge.ts: message, shareTitle; challenge-share component);
// - INVITE ANOTHER GROUP (invite-group.ts: inviteMessage, hanukkahInvite; invite-group component).
// The lobby invite already says so (hanukkah-link-join.test.js).
// Run: npm test (from game/). Needs Node 20+.
process.env.TZ = 'Asia/Jerusalem';
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

/** The share service's words (and its ordinal helper), without Angular. */
function shareStrings() {
    const share = fs.readFileSync(path.join(app, 'services', 'share.service.ts'), 'utf8');
    const part = share.slice(share.indexOf('const strings = {'), share.indexOf('/**\n * Everything'));
    const js = ts.transpileModule(`${part}\nreturn strings;`, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText;
    return new Function(js)();
}

const s = shareStrings();
const c = load(path.join(app, 'components', 'challenge', 'challenge.ts'));
const g = load(path.join(app, 'components', 'invite-group', 'invite-group.ts'));

const HE = 'חנוכה';
const EN = 'Hanukkah';

test('results share: a Hanukkah game says Hanukkah game night; other games keep their text', () => {
    assert.strictEqual(s.he.resultsText(1, 5, 4200, 'hanukkah'),
        'ניצחתי בערב הבולשיט של חנוכה עם 4200 נקודות! חושבים שתצליחו לעבוד עליי? שחקו בחינם ב-bullshit.wtf');
    assert.strictEqual(s.he.resultsText(2, 5, 3100, 'hanukkah'),
        'הגעתי למקום 2 מתוך 5 בערב הבולשיט של חנוכה, עם 3100 נקודות. תצליחו יותר? שחקו בחינם ב-bullshit.wtf');
    assert.strictEqual(s.he.groupResultsText('סבתא', 5000, 'hanukkah'),
        'הניצחון בערב הבולשיט של חנוכה הלך ל-סבתא עם 5000 נקודות. תצליחו לעבוד על החברים? שחקו בחינם ב-bullshit.wtf');
    assert.strictEqual(s.en.resultsText(1, 5, 4200, 'hanukkah'),
        'I won our Hanukkah game night of Bullshit with 4200 points! Think you can fool me? Play free at bullshit.wtf');
    assert.strictEqual(s.en.resultsText(3, 5, 900, 'hanukkah'),
        'I came 3rd of 5 at our Hanukkah game night of Bullshit with 900 points. Can you beat that? Play free at bullshit.wtf');
    assert.ok(s.en.groupResultsText('Noa', 5000, 'hanukkah').startsWith('Noa won our Hanukkah game night of Bullshit'));

    // Every other game: today's words, word for word.
    assert.strictEqual(s.he.resultsText(1, 5, 4200),
        'ניצחתי בבולשיט עם 4200 נקודות! חושבים שתצליחו לעבוד עליי? שחקו בחינם ב-bullshit.wtf');
    assert.strictEqual(s.he.resultsText(2, 5, 3100),
        'הגעתי למקום 2 מתוך 5 בבולשיט עם 3100 נקודות. תצליחו יותר? שחקו בחינם ב-bullshit.wtf');
    assert.strictEqual(s.he.groupResultsText('סבתא', 5000),
        'הניצחון במשחק הבולשיט שלנו הלך ל-סבתא עם 5000 נקודות. תצליחו לעבוד על החברים? שחקו בחינם ב-bullshit.wtf');
    assert.strictEqual(s.en.resultsText(1, 5, 4200),
        'I won at Bullshit with 4200 points! Think you can fool me? Play free at bullshit.wtf');
    assert.strictEqual(s.en.resultsText(3, 5, 900),
        'I came 3rd of 5 at Bullshit with 900 points. Can you beat that? Play free at bullshit.wtf');
    for (const pack of [null, undefined, '', 'christmas', 'thanksgiving', 'kids']) {
        for (const lang of ['he', 'en']) {
            assert.strictEqual(s[lang].resultsText(1, 4, 10, pack), s[lang].resultsText(1, 4, 10));
            assert.strictEqual(s[lang].resultsText(2, 4, 10, pack), s[lang].resultsText(2, 4, 10));
            assert.strictEqual(s[lang].groupResultsText('X', 10, pack), s[lang].groupResultsText('X', 10));
            assert.ok(s[lang].resultsText(1, 4, 10, pack).indexOf(lang === 'he' ? HE : EN) < 0);
        }
    }
    // The component passes the game's pack to both texts.
    const comp = fs.readFileSync(path.join(app, 'components', 'share-results', 'share-results.component.ts'), 'utf8');
    assert.ok(comp.indexOf('t.resultsText(place, players.length, players[idx].score || 0, this.pack)') > 0);
    assert.ok(comp.indexOf('winner ? winner.score || 0 : 0, this.pack)') > 0);
    assert.ok(comp.indexOf('this.apiService.getGamePack(this.pin)') > 0);
});

test('challenge: a Hanukkah game\'s message and title say Hanukkah; other games keep theirs', () => {
    const he = c.challengeWords('he');
    const en = c.challengeWords('en');
    assert.strictEqual(he.message(6500, 7, 'hanukkah'),
        'ערב בולשיט של חנוכה: עשינו 6500 נקודות. אותן 7 שאלות, החבורה שלכם: תצליחו לנצח אותנו?');
    assert.strictEqual(en.message(6500, 7, 'hanukkah'),
        'Our Hanukkah game night of Bullshit: we scored 6500. Same 7 questions, your group: can you beat us?');
    assert.strictEqual(he.shareTitle('hanukkah'), 'אתגר חנוכה בבולשיט');
    assert.strictEqual(en.shareTitle('hanukkah'), 'A Hanukkah Bullshit challenge');
    for (const pack of [null, undefined, '', 'christmas']) {
        assert.strictEqual(he.message(6500, 7, pack), 'עשינו 6500 נקודות בבולשיט. אותן 7 שאלות, החבורה שלכם: תצליחו לנצח אותנו?');
        assert.strictEqual(en.message(6500, 7, pack), 'We scored 6500 at Bullshit. Same 7 questions, your group: can you beat us?');
        assert.strictEqual(he.shareTitle(pack), 'אתגר בבולשיט');
        assert.strictEqual(en.shareTitle(pack), 'A Bullshit challenge');
    }
    const comp = fs.readFileSync(path.join(app, 'components', 'challenge', 'challenge-share.component.ts'), 'utf8');
    assert.ok(comp.indexOf('this.t.message(this.card.top, this.card.questions, this.pack)') > 0);
    assert.ok(comp.indexOf('title: this.t.shareTitle(this.pack)') > 0);
    assert.ok(comp.indexOf('this.apiService.getGamePack(this.pin)') > 0);
});

test('invite another group: after a Hanukkah game, a night up to the eighth candle is a Hanukkah game night', () => {
    // Friday 4 December 2026 (first candle), 21:00 in Israel; Saturday 12 December, after the eighth.
    const first = new Date(2026, 11, 4, 21, 0, 0, 0);
    const eighth = new Date(2026, 11, 11, 21, 0, 0, 0);
    const after = new Date(2026, 11, 12, 21, 0, 0, 0);
    const before = new Date(2026, 10, 27, 21, 0, 0, 0);
    assert.strictEqual(g.hanukkahInvite(first, 'hanukkah'), true);
    assert.strictEqual(g.hanukkahInvite(eighth, 'hanukkah'), true);
    assert.strictEqual(g.hanukkahInvite(before, 'hanukkah'), true);
    assert.strictEqual(g.hanukkahInvite(after, 'hanukkah'), false);
    assert.strictEqual(g.hanukkahInvite(first, null), false);
    assert.strictEqual(g.hanukkahInvite(first, 'christmas'), false);
    assert.strictEqual(g.hanukkahInvite(new Date(NaN), 'hanukkah'), false);

    const plainHe = g.inviteMessage(first, 'he', null);
    const he = g.inviteMessage(first, 'he', null, 'hanukkah');
    assert.ok(he.startsWith('מצאתי לנו משחק לחנוכה: בולשיט. כולם ממציאים שקר ומנסים לזהות את האמת. ערב בולשיט של חנוכה עליי, '), he);
    assert.ok(he.endsWith('. מי בפנים? לוחצים כאן:'));
    // The night's label is the same one the plain message carries.
    const label = plainHe.slice('מצאתי לנו משחק: בולשיט. כולם ממציאים שקר ומנסים לזהות את האמת. המשחק עליי, '.length);
    assert.ok(he.endsWith(label));
    const lieHe = g.inviteMessage(first, 'he', { text: 'סביבון מסתובב הפוך', fooled: 2 }, 'hanukkah');
    assert.ok(lieHe.startsWith('הערב עבדתי על שני אנשים בבולשיט של חנוכה עם השקר הזה: "סביבון מסתובב הפוך". נראה אתכם. ערב בולשיט של חנוכה עליי, '), lieHe);

    const en = g.inviteMessage(first, 'en', null, 'hanukkah');
    assert.ok(en.startsWith('Found us a game for Hanukkah: Bullshit. Everyone makes up a lie and tries to spot the truth. A Hanukkah game night on me, '), en);
    const lieEn = g.inviteMessage(first, 'en', { text: 'latkes', fooled: 1 }, 'hanukkah');
    assert.ok(lieEn.startsWith('Tonight I fooled someone in a Hanukkah game of Bullshit with this lie: "latkes". Think you\'d do better? A Hanukkah game night on me, '), lieEn);

    // After the eighth candle, and in every other game: today's message, word for word.
    for (const lang of ['he', 'en']) {
        for (const best of [null, { text: 'x', fooled: 3 }]) {
            assert.strictEqual(g.inviteMessage(after, lang, best, 'hanukkah'), g.inviteMessage(after, lang, best));
            for (const pack of [null, undefined, '', 'christmas']) {
                assert.strictEqual(g.inviteMessage(first, lang, best, pack), g.inviteMessage(first, lang, best));
            }
            assert.ok(g.inviteMessage(first, lang, best).indexOf(lang === 'he' ? HE : EN) < 0);
        }
    }
    const comp = fs.readFileSync(path.join(app, 'components', 'invite-group', 'invite-group.component.ts'), 'utf8');
    assert.ok(comp.indexOf('inviteMessage(this.night, this.locale, this.best, this.pack)') > 0);
    assert.ok(comp.indexOf('this.apiService.getGamePack(this.pin)') > 0);
});
