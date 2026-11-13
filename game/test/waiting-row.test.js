// Tests for the row of players on the two waiting screens: who is in, and who the room waits for
// (src/app/components/waiting-row/waiting-row.ts, on waitingRow from the shared game model).
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({ nameFlag: () => null }));
    return mod.exports;
}

const app = path.join(__dirname, '..', 'src', 'app');
const { rowView, PICTURES } = load(path.join(app, 'components', 'waiting-row', 'waiting-row.ts'));
const { gameStrings } = load(path.join(app, 'pages', 'game-strings.ts'));
// The shared model, from the repository's root (npm run copy-model copies it into the app).
const { waitingRow, sentMark, MAX_PLAYERS, seatPicture } = load(path.join(__dirname, '..', '..', 'game-model.ts'));

const en = gameStrings('en');
const he = gameStrings('he');
const MADE = 1000;
const lies = { id: 2, timestamp: 5000 };
const picks = { id: 3, timestamp: 9000 };

function room(names, sent) {
    const players = {};
    names.forEach((name, i) => {
        players['p' + (i + 1)] = { nickname: name, score: 0, uid: 'u' + i };
        if (sent && sent[name]) players['p' + (i + 1)].sent = sent[name];
    });
    return players;
}

test('on an older server the screen says what it always said, with no row', () => {
    const row = waitingRow(room(['Dana', 'Chen', 'Ben']), lies, 0, MADE);
    assert.deepStrictEqual(rowView(row, en.answerSubmitted, en), { line: 'Your answer has been submitted', seats: [] });
    assert.deepStrictEqual(rowView(undefined, en.waitForFriends, en), { line: 'Let\'s wait for your friends', seats: [] });
    assert.deepStrictEqual(rowView(null, '', en), { line: '', seats: [] });
});

test('every player\'s picture, a tick on those who are in and dots on those who are not', () => {
    const row = waitingRow(room(['Dana', 'Chen', 'Ben', 'Gal'], { Dana: sentMark(lies), Ben: sentMark(lies) }), lies, 0, MADE);
    const view = rowView(row, en.answerSubmitted, en);
    assert.strictEqual(view.line, 'Your answer has been submitted', 'two are left: nobody is named');
    assert.deepStrictEqual(view.seats.map(s => [s.nickname, s.picture, s.mark, s.label]), [
        ['Dana', 'avatar0.png', 'done', 'Dana is in'],
        ['Chen', 'avatar1.png', 'waiting', 'Chen, not yet'],
        ['Ben', 'avatar2.png', 'done', 'Ben is in'],
        ['Gal', 'avatar3.png', 'waiting', 'Gal, not yet'],
    ]);
});

test('"Waiting for Chen" when one is left, in the game\'s language', () => {
    const players = room(['Dana', 'Chen', 'Ben'], { Dana: sentMark(picks), Ben: sentMark(picks) });
    const row = waitingRow(players, picks, 0, MADE);
    assert.strictEqual(rowView(row, en.waitForFriends, en).line, 'Waiting for Chen');
    assert.strictEqual(rowView(row, he.waitForFriends, he).line, 'מחכים ל־Chen');
    assert.deepStrictEqual(rowView(row, he.waitForFriends, he).seats.map(s => s.label), ['Dana בפנים', 'Chen, עוד לא', 'Ben בפנים']);
    // The big screen has no line of its own: it names the last player all the same.
    assert.strictEqual(rowView(row, '', en).line, 'Waiting for Chen');
});

test('the big screen says nothing while more than one is left, or when everyone is in', () => {
    const one = waitingRow(room(['Dana', 'Chen', 'Ben'], { Dana: sentMark(lies) }), lies, 0, MADE);
    assert.strictEqual(rowView(one, '', en).line, '');
    const all = waitingRow(room(['Dana', 'Chen'], { Dana: sentMark(lies), Chen: sentMark(lies) }), lies, 0, MADE);
    assert.strictEqual(rowView(all, '', en).line, '');
    assert.deepStrictEqual(rowView(all, '', en).seats.map(s => s.mark), ['done', 'done']);
});

test('in the bar on top of the big screen, the last player stands alone beside the line', () => {
    const players = room(['Dana', 'Chen', 'Ben'], { Dana: sentMark(picks) });
    const two = rowView(waitingRow(players, picks, 0, MADE), '', en, true);
    assert.strictEqual(two.line, '');
    assert.deepStrictEqual(two.seats.map(s => [s.nickname, s.mark]), [['Dana', 'done'], ['Chen', 'waiting'], ['Ben', 'waiting']]);
    players.p3.sent = sentMark(picks);
    const one = rowView(waitingRow(players, picks, 0, MADE), '', en, true);
    assert.strictEqual(one.line, 'Waiting for Chen');
    assert.deepStrictEqual(one.seats.map(s => [s.nickname, s.mark, s.picture]), [['Chen', 'waiting', 'avatar1.png']]);
});

test('a seat nobody plays is shown as away, never as waited for, and never named', () => {
    // Question 2. Ben sent nothing on question 1; Dana and Chen did, and Dana's lie is in.
    const players = room(['Dana', 'Chen', 'Ben'], { Dana: sentMark(lies), Chen: '3:3000' });
    const row = waitingRow(players, lies, 1, MADE);
    const view = rowView(row, en.answerSubmitted, en);
    assert.deepStrictEqual(view.seats.map(s => [s.nickname, s.mark, s.label]), [
        ['Dana', 'done', 'Dana is in'], ['Chen', 'waiting', 'Chen, not yet'], ['Ben', 'away', ''],
    ]);
    assert.strictEqual(view.line, 'Waiting for Chen', 'the one seat the game waits for');

    // Everyone who plays is in: the game waits out the seat's first seconds, and nobody is named.
    players.p2.sent = sentMark(lies);
    assert.strictEqual(rowView(waitingRow(players, lies, 1, MADE), en.answerSubmitted, en).line, 'Your answer has been submitted');
});

test('on the first question every seat is waited for, a silent one too', () => {
    const row = waitingRow(room(['Dana', 'Chen', 'Ben'], { Dana: sentMark(lies), Chen: sentMark(lies) }), lies, 0, MADE);
    assert.strictEqual(rowView(row, en.answerSubmitted, en).line, 'Waiting for Ben');
});

test('the marks of the lies tick nobody while answers are picked', () => {
    const players = room(['Dana', 'Chen'], { Dana: sentMark(lies), Chen: sentMark(lies) });
    const row = waitingRow(players, picks, 0, MADE);
    assert.deepStrictEqual(row.seats.map(s => s.done), [false, false]);
    assert.deepStrictEqual(rowView(row, '', en).seats, [], 'and the big screen shows no row before the first pick');
});

test('no row while the server is not seen to mark this phase', () => {
    // Marks from an earlier question, none in this one: a server rolled back in the middle of a game.
    const players = room(['Dana', 'Chen', 'Ben'], { Dana: '2:3000', Chen: '2:3000', Ben: '2:3000' });
    const row = waitingRow(players, lies, 1, MADE);
    assert.strictEqual(row.known, true);
    assert.deepStrictEqual(rowView(row, en.answerSubmitted, en, false, 'p1'), { line: 'Your answer has been submitted', seats: [] });
    assert.deepStrictEqual(rowView(row, '', en), { line: '', seats: [] }, 'the big screen waits for the first tick');

    // Chen's lie is marked, this phone's own (Dana's) is not: still the old line on Dana's phone.
    players.p2.sent = sentMark(lies);
    const next = waitingRow(players, lies, 1, MADE);
    assert.deepStrictEqual(rowView(next, en.answerSubmitted, en, false, 'p1'), { line: 'Your answer has been submitted', seats: [] });
    assert.strictEqual(rowView(next, en.answerSubmitted, en, false, 'p2').seats.length, 3, 'Chen\'s phone has its row');
    assert.strictEqual(rowView(next, '', en).seats.length, 3, 'and so has the big screen');
});

test('a player alone gets no row', () => {
    const row = waitingRow(room(['Dana'], { Dana: sentMark(lies) }), lies, 0, MADE);
    assert.deepStrictEqual(rowView(row, en.answerSubmitted, en), { line: 'Your answer has been submitted', seats: [] });
});

test('eight players: eight pictures, and the row holds only names and marks', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const view = rowView(waitingRow(room(names, { A: sentMark(lies) }), lies, 0, MADE), '', en);
    assert.deepStrictEqual(view.seats.map(s => s.picture), [0, 1, 2, 3, 4, 5, 6, 7].map(i => `avatar${i}.png`));
    view.seats.forEach(s => assert.deepStrictEqual(Object.keys(s).sort(),
        ['away', 'done', 'index', 'label', 'mark', 'nickname', 'picture', 'pid']));
});

test('twelve players: twelve pictures, three even lines of four, and each seat its own picture', () => {
    assert.strictEqual(PICTURES, MAX_PLAYERS);
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const view = rowView(waitingRow(room(names, { A: sentMark(lies) }), lies, 0, MADE), '', en);
    const pictures = view.seats.map(s => s.picture);
    assert.deepStrictEqual(pictures, names.map((n, i) => `avatar${i}.png`));
    // The pages that list players (scoreboards, reveal) name the same files.
    assert.deepStrictEqual(names.map((n, i) => seatPicture(i)), pictures);
    // Every picture exists in the app's assets.
    pictures.forEach(p => assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'assets', p)), p));
    // A thirteenth seat (two joins in the same instant) reuses a picture instead of a missing file.
    assert.strictEqual(seatPicture(12), 'avatar0.png');
});

test('both waiting screens, on phones and on the big screen, show the row', () => {
    const q = fs.readFileSync(path.join(app, 'pages', 'show-question', 'show-question.component.html'), 'utf8');
    const a = fs.readFileSync(path.join(app, 'pages', 'show-answers', 'show-answers.component.html'), 'utf8');
    assert.match(q, /<app-waiting-row \[pin\]="pin" \[t\]="t" \[line\]="t\.answerSubmitted">/);
    assert.match(a, /<app-waiting-row \[pin\]="pin" \[t\]="t" \[line\]="t\.waitForFriends">/);
    assert.strictEqual((q.match(/<app-waiting-row [^>]*\[presenter\]="true"/g) || []).length, 1);
    assert.strictEqual((a.match(/<app-waiting-row [^>]*\[presenter\]="true" \[compact\]="true"/g) || []).length, 1);
});
