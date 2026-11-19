// Tests for the story card (src/app/components/share-results/story-card.ts) and its wiring:
// the sharer's own lie only, its words in both languages, the ?via=story link, one shares row a press.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const dir = path.join(__dirname, '..', 'src', 'app', 'components', 'share-results');
const card = load(path.join(dir, 'story-card.ts'));
const { storyLie, questionWithBlank, countLine, storyBadges, storyWords, wrapLines, STORY_VIA, storyStrings } = card;

const q = 'The world\'s oldest $blank$ is 5,000 years old.';
const others = [
    { nickname: 'DANA', best: { text: 'cheese', fooled: 4, q }, biggest: true, me: false },
    { nickname: 'OMER', funniest: { text: 'a grumpy goat', laughs: 5, q }, me: false },
];

test('the card is about this phone\'s own best lie: question with its blank, lie, friends fooled', () => {
    const me = { nickname: 'ME', best: { text: ' sock ', fooled: 2, q }, me: true };
    assert.deepStrictEqual(storyLie(others.concat([me])), {
        question: 'The world\'s oldest _____ is 5,000 years old.',
        lie: 'sock', fooled: 2, laughs: 0, biggest: false, funniest: false,
    });
});

test('no row of this phone (the big screen, a spectator): no card, even when others have lies', () => {
    assert.strictEqual(storyLie(others), null);
    assert.strictEqual(storyLie([]), null);
    assert.strictEqual(storyLie(undefined), null);
});

test('a lie that fooled nobody and got no laugh: no card', () => {
    assert.strictEqual(storyLie([{ me: true }]), null);
    assert.strictEqual(storyLie([{ me: true, best: { text: 'x', fooled: 0 } }]), null);
    assert.strictEqual(storyLie([{ me: true, best: { text: '', fooled: 2 } }]), null);
});

test('the badges the sharer won ride on the card', () => {
    const lie = storyLie([{ me: true, biggest: true, best: { text: 'sock', fooled: 3, q },
        funniest: { text: 'sock', laughs: 4, q } }]);
    assert.strictEqual(lie.biggest, true);
    assert.strictEqual(lie.funniest, true);
    assert.strictEqual(lie.laughs, 4);
    assert.deepStrictEqual(storyBadges(lie, 'en'), ['BIGGEST BULLSHITTER', 'FUNNIEST LIE']);
    assert.deepStrictEqual(storyBadges(lie, 'he'), ['הבולשיטר הגדול', 'השקר הכי מצחיק']);
});

test('a funniest lie that is not the best lie: the card keeps the best lie, and the badge the player won', () => {
    const lie = storyLie([{ me: true, best: { text: 'sock', fooled: 1, q }, funniest: { text: 'goat', laughs: 3, q: 'Other $blank$' } }]);
    assert.strictEqual(lie.lie, 'sock');
    assert.strictEqual(lie.laughs, 0);
    assert.strictEqual(countLine(lie, 'en'), 'FOOLED 1 FRIEND');
    assert.deepStrictEqual(storyBadges(lie, 'en'), ['FUNNIEST LIE']);
});

test('fooled nobody but wrote the funniest lie: the card is that lie, with its laughs', () => {
    const lie = storyLie([{ me: true, funniest: { text: 'a grumpy goat', laughs: 5, q: 'My $ blank $ ate it' } }]);
    assert.deepStrictEqual(lie, { question: 'My _____ ate it', lie: 'a grumpy goat', fooled: 0, laughs: 5, biggest: false, funniest: true });
    assert.strictEqual(countLine(lie, 'en'), '5 FRIENDS LAUGHED');
    assert.strictEqual(countLine(lie, 'he'), '5 חברים צחקו');
});

test('a game that kept no question with the lie: the card goes without it', () => {
    assert.strictEqual(storyLie([{ me: true, best: { text: 'sock', fooled: 1 } }]).question, '');
    assert.strictEqual(questionWithBlank(undefined), '');
});

test('the count line in both languages, one and many', () => {
    const one = { fooled: 1, laughs: 0 };
    const many = { fooled: 3, laughs: 0 };
    assert.strictEqual(countLine(one, 'en'), 'FOOLED 1 FRIEND');
    assert.strictEqual(countLine(many, 'en'), 'FOOLED 3 FRIENDS');
    assert.strictEqual(countLine(one, 'he'), 'חבר אחד נפל בזה');
    assert.strictEqual(countLine(many, 'he'), '3 חברים נפלו בזה');
});

test('the game\'s name: bullshit.wtf in English, בולשיט on a Hebrew game; any other language is English', () => {
    assert.strictEqual(storyWords('en').name, 'BULLSHIT.WTF');
    assert.strictEqual(storyWords('he').name, 'בולשיט');
    assert.strictEqual(storyWords(undefined).name, 'BULLSHIT.WTF');
    assert.deepStrictEqual(Object.keys(storyStrings.he).sort(), Object.keys(storyStrings.en).sort());
});

test('the link tag is story: a campaign tag, not a join source', () => {
    assert.strictEqual(STORY_VIA, 'story');
    const src = load(path.join(__dirname, '..', 'src', 'app', 'services', 'join-source.ts'));
    assert.strictEqual(src.readCampaign('?via=story'), 'story');
    assert.strictEqual(src.readVia('?via=story'), 'other');
});

test('wrapLines breaks by words, cuts a long word, and ends a cut text with an ellipsis', () => {
    const w = (s) => s.length; // one unit a letter
    assert.deepStrictEqual(wrapLines('aa bb cc dd', 5, w), ['aa bb', 'cc dd']);
    assert.deepStrictEqual(wrapLines('abcdefghij', 5, w), ['abcd…']);
    assert.deepStrictEqual(wrapLines('aa bb cc dd ee', 5, w, 2), ['aa bb', 'cc d…']);
    assert.deepStrictEqual(wrapLines('', 5, w), []);
    assert.deepStrictEqual(wrapLines('aa', 5, w, 1), ['aa']);
});

const html = fs.readFileSync(path.join(dir, 'share-results.component.html'), 'utf8');
const comp = fs.readFileSync(path.join(dir, 'share-results.component.ts'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'services', 'results-card.service.ts'), 'utf8');

test('one story button under SHARE RESULTS, only when the player has a lie to post', () => {
    assert.strictEqual((html.match(/story-button/g) || []).length, 1);
    assert.match(html, /\*ngIf="story"[^>]*\(click\)="postStory\(\)"/);
    assert.ok(html.indexOf('share-results-button') < html.indexOf('story-button'));
});

test('each press is a shares row (results / story); the link carries ?via=story; files go to the share sheet', () => {
    assert.match(comp, /logShare\('results', 'story'/);
    assert.match(comp, /siteUrl\(this\.locale, STORY_VIA\)/);
    assert.match(comp, /canShareFiles\(files\)/);
    assert.match(comp, /share\(\{ files,/);
    assert.match(comp, /download\(this\.storyBlob/);
});

test('the story card is drawn 1080 by 1920 by the results card\'s own service, with no avatars', () => {
    assert.match(service, /STORY_W = 1080/);
    assert.match(service, /STORY_H = 1920/);
    const story = service.slice(service.indexOf('async renderStory'), service.indexOf('private async loadFonts'));
    assert.ok(story.length > 100);
    assert.doesNotMatch(story, /loadImage|nickname|picture/);
});
