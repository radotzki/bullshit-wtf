// The reveal must not tell a house lie from a player's lie before the row's writer beat: not by its
// laugh button, its count, its look or its place (the QA objection on pull request 80).
// Read from the reveal page's template and code, since the page itself is played in local games.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'reveal-the-truth');
const html = fs.readFileSync(path.join(dir, 'reveal-the-truth.component.html'), 'utf8');
const code = fs.readFileSync(path.join(dir, 'reveal-the-truth.component.ts'), 'utf8');

function template(name) {
    const start = html.indexOf(`<ng-template #${name}`);
    assert.notStrictEqual(start, -1, `template ${name}`);
    return html.slice(start, html.indexOf('</ng-template>', start));
}

test('the laugh button and count do not look at whose lie it is', () => {
    const laugh = template('laughButton');
    assert.doesNotMatch(laugh, /houseLie|playerLie|creators/);
    // The button follows canLaugh (any lie this phone did not write), the count any lie with a laugh.
    assert.match(laugh, /\*ngIf="row\.laughable"/);
    assert.match(laugh, /\*ngIf="!row\.laughable && row\.lie && counted && row\.laughs"/);
    assert.match(code, /laughable = !!me && canLaugh\(a, me\)/);
    assert.match(code, /row\.laughs = row\.lie \? view\.count : 0/);
});

test('a row looks like a house lie only from its writer beat, in both reveals', () => {
    const classes = html.match(/\[class\.house\]="[^"]*"/g);
    assert.strictEqual(classes.length, 2);
    classes.forEach(c => assert.strictEqual(c, '[class.house]="row.houseLie && i < writersShown"'));
    // Any other mention of houseLie is inside the writer line, which shows at the writer beat.
    const writerBlocks = html.split('<div class="writer" [class.shown]="i < writersShown">').length - 1;
    assert.strictEqual(writerBlocks, 2);
    const mentions = (html.match(/\*ngIf="row\.houseLie"/g) || []).length + (html.match(/!row\.houseLie/g) || []).length;
    assert.strictEqual(mentions, 4);
});

test('the order of picked rows does not depend on whose lie it is', () => {
    const sort = code.match(/const picked = [^;]*;/s);
    assert.ok(sort, 'picked rows');
    assert.doesNotMatch(sort[0], /houseLie|creators|playerLie/);
    assert.match(sort[0], /a\.pickers\.length - b\.pickers\.length/);
});

test('a count shows only from its row\'s writer beat, on phones and the big screen, in both reveals', () => {
    // A house lie can take a laugh from every player, a player's lie from all but its writer. So a count
    // alone can tell the house wrote a lie (3 players: 2 laughs on a lie you did not laugh at; any screen:
    // as many laughs as players). The QA tester's second look at pull request 80 saw it on screen.
    const laugh = template('laughButton');
    assert.match(laugh, /let-counted="counted"/);
    // The count in the button, and the count alone (the writer's phone, the big screen): both wait for it.
    const numbers = (laugh.match(/\{\{ row\.laughs \}\}/g) || []).length;
    const gated = laugh.match(/\*ngIf="[^"]*counted[^"]*row\.laughs"/g) || [];
    assert.strictEqual(numbers, 2);
    assert.strictEqual(gated.length, 2, 'both counts wait for counted');
    // Every timed row hands counted as its writer beat; the rows of lies nobody picked show their writers
    // from the start, so their counts show at once.
    const uses = html.match(/\[ngTemplateOutlet\]="laughButton" \[ngTemplateOutletContext\]="\{[^"]*\}"/g);
    assert.strictEqual(uses.length, 3);
    assert.strictEqual(uses.filter(u => /row: row, counted: i < writersShown/.test(u)).length, 2);
    assert.strictEqual(uses.filter(u => /row: u, counted: true/.test(u)).length, 1);
    // The button itself is there from the row's first beat, so a tap before the writer beat still counts.
    assert.match(laugh, /<button \*ngIf="row\.laughable"/);
});
