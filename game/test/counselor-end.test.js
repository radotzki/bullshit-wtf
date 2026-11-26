// Tests for the counselor's ending to the taste (taste-strings.ts: counselorStrings, groupTag,
// activityLink, and the final screen's template): a taste opened from a group page ends on the day of
// the activity, and every other taste ends on the ordinary invitation, as before.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
}

const pages = path.join(__dirname, '..', 'src', 'app', 'pages');
const { tasteStrings, counselorStrings, groupTag, activityLink } = load(path.join(pages, 'taste-strings.ts'));
const html = fs.readFileSync(path.join(pages, 'score-board-final', 'score-board-final.component.html'), 'utf8');
const component = fs.readFileSync(path.join(pages, 'score-board-final', 'score-board-final.component.ts'), 'utf8');
const hebrew = /[֐-׿]/;
const latin = /[A-Za-z]/;

test('a game from a group page or a counselors\' post gets the counselor\'s ending', () => {
    for (const tag of ['peula-net', 'seo-he-youth', 'seo-he-gibush', 'bnei-akiva', 'zofim', 'pitch-he-zofim', 'pop-edu', 'wa-he-madrichim']) {
        assert.strictEqual(groupTag(tag), tag, tag);
        assert.strictEqual(groupTag(tag.toUpperCase()), tag, tag + ' in capitals');
    }
});

test('a play-test of a group tag gets it too, and keeps its test tag on the saved link', () => {
    assert.strictEqual(groupTag('test-peula-net'), 'peula-net');
    assert.strictEqual(activityLink('test-peula-net'), 'https://bullshit.wtf/he/youth-group?via=test-peula-net');
});

test('every other game keeps the ordinary ending', () => {
    for (const tag of [null, undefined, '', 'test', 'test-lobby', 'peula-net-home', 'seo-he-hanukkah', 'seo-he-home',
        'seo-en-family-night', 'after-game', 'hanukkah-night-2', 'kit-he-teachers', 'peula-net-x', 'xpeula-net',
        'constructor', '__proto__', 'hasOwnProperty']) {
        assert.strictEqual(groupTag(tag), null, String(tag));
        assert.strictEqual(activityLink(tag), null, String(tag));
    }
});

test('the saved link is the post\'s page with the same tag, so the day\'s game counts as the post\'s', () => {
    assert.strictEqual(activityLink('peula-net'), 'https://bullshit.wtf/he/youth-group?via=peula-net');
    assert.strictEqual(activityLink('seo-he-youth'), 'https://bullshit.wtf/he/youth-group?via=seo-he-youth');
    assert.strictEqual(activityLink('bnei-akiva'), 'https://bullshit.wtf/he/youth-group?via=bnei-akiva');
    assert.strictEqual(activityLink('seo-he-gibush'), 'https://bullshit.wtf/he/gibush?via=seo-he-gibush');
    // The youth page's own "send to other counselors" WhatsApp button.
    assert.strictEqual(activityLink('wa-he-madrichim'), 'https://bullshit.wtf/he/youth-group?via=wa-he-madrichim');
    assert.strictEqual(activityLink('test-wa-he-madrichim'), 'https://bullshit.wtf/he/youth-group?via=test-wa-he-madrichim');
});

test('the counselor\'s words, as the play-through report wrote them, Hebrew in Hebrew and English in English', () => {
    const he = counselorStrings('he');
    const en = counselorStrings('en');
    assert.strictEqual(counselorStrings('fr'), en);
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    assert.strictEqual(he.title, 'ככה זה נראה מהטלפון שלכם. בפעולה זה משחק אחר:');
    assert.deepStrictEqual(he.lines, [
        'החניכים כותבים שקרים, לא רק בוחרים.',
        'ביום הפעולה פותחים משחק חדש מול החניכים: הם סורקים את הקוד מהמסך, ואתם לוחצים \'מתחילים\'. זה לוקח דקה.',
        'יש מקרן? פתחו את המשחק במחשב ולחצו \'להפוך למסך הגדול\'.',
    ]);
    assert.strictEqual(he.seeIt, 'לראות את המשחק האמיתי עם טלפון נוסף');
    assert.strictEqual(he.save, 'שמירת הקישור לפעולה');
    assert.strictEqual(en.lines.length, 3);
    Object.keys(en).forEach(key => {
        const say = t => [].concat(t[key]).join(' ');
        assert.ok(say(en) && !hebrew.test(say(en)), `English ${key}`);
        assert.ok(say(he) && hebrew.test(say(he)) && !latin.test(say(he)), `Hebrew ${key}`);
    });
    // The buttons it names are the lobby's own words.
    assert.ok(en.lines[1].indexOf('START') > 0 && en.lines[2].indexOf('USE AS THE BIG SCREEN') > 0);
});

test('the ordinary taste ending is unchanged', () => {
    const he = tasteStrings('he');
    const en = tasteStrings('en');
    assert.strictEqual(he.askTitle, 'עכשיו נסו עם חברים');
    assert.strictEqual(he.invite, 'הזמנת חברים');
    assert.strictEqual(en.askTitle, 'Now try it with friends');
    assert.strictEqual(en.invite, 'INVITE FRIENDS');
    // The screen shows one ending or the other, never both, and the ordinary one keeps its parts.
    assert.ok(html.indexOf('*ngIf="counselorEnd && !rematchPin"') > 0);
    const ordinary = html.indexOf('*ngIf="soloTaste && !counselorEnd && !rematchPin" class="taste-ask"');
    assert.ok(ordinary > 0);
    const block = html.slice(ordinary, html.indexOf('</div>\n                <button', ordinary));
    for (const part of ['tasteWords.askTitle', 'tasteWords.invite', 'runWords.keepGoing', 'tasteWords.inviteHint', 'tasteWords.daily']) {
        assert.ok(block.indexOf(part) > 0, part);
    }
    // A solo run's end is never the counselor's.
    assert.ok(/counselorEnd\(\): boolean \{\s*return this\.soloTaste && !this\.soloRunEnd && !!this\.counselorTag;/.test(component));
});
