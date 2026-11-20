// A player on a computer (a colleague on a video call with no phone at hand) picks from two answers to a
// line, so a table's 12 answers fit beside the call. Phones (under 769 px) and the big screen keep theirs.
// Found on the remote office party walk-through: one answer to a line ran 1,030 px below a 1366 x 768 screen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const scss = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'pages', 'show-answers', 'show-answers.component.scss'), 'utf8');

test('from 769 px up, a player\'s answers go two to a line; the big screen\'s list is left alone', () => {
    const at = scss.indexOf('@media screen and (min-width: 769px)');
    assert.ok(at >= 0, 'a rule for tablet width and up');
    const rule = scss.slice(at);
    assert.match(rule, /div:not\(\.presenter\):has\(> \.control > \.answer\)/);
    assert.match(rule, /display: flex;/);
    assert.match(rule, /flex: 0 0 calc\(50% - 6px\)/);
    assert.match(rule, /height: auto;/);
});
