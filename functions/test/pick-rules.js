// Local run: the database rule for picks (games/{pin}/answerSelections in database-rules.json).
// Every pick a phone really makes must be accepted: in every phase, signed in or not, by a player who
// joined late or joined again, and when a player changes nothing but writes twice. Anything that is
// not a player's pick must be refused. The server's own writes must always be accepted.
//
// Needs the Realtime Database emulator on 127.0.0.1:9000 (see test/sleeping-phones.js).
// Then: node test/pick-rules.js [rules file]

const assert = require('assert');
const { rest, owner, server, phone, signedIn, loadRules } = require('./emulator');

const PIN = 'RULE';
const picks = `games/${PIN}/answerSelections`;
const names = ['GameStaging', 'RoundIntro', 'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal'];
let checks = 0;

async function accepted(what, method, p, body, who) {
    const r = await rest(method, p, body, who);
    assert.ok(r.ok, `must be accepted: ${what} (got ${r.status})`);
    checks++;
}

async function refused(what, method, p, body, who) {
    const before = (await rest('GET', picks, undefined, owner)).json;
    const r = await rest(method, p, body, who);
    assert.ok(r.status === 401 || r.status === 403, `must be refused: ${what} (got ${r.status})`);
    assert.deepStrictEqual((await rest('GET', picks, undefined, owner)).json, before, `and must change nothing: ${what}`);
    checks++;
}

(async () => {
    const file = await loadRules(process.argv[2]);
    console.log(`rules: ${file}`);

    await rest('PUT', `games/${PIN}`, {
        state: { id: 0, timestamp: 1 }, locale: 'en', timestamp: 1, roundIndex: 0, questionIndex: 0, totalQ: 3,
        tick: 0, presenter: false,
        players: {
            '-Nabc_DEF-123': { nickname: 'ana', score: 0, uid: 'uid-ana' },
            '-Nabc_DEF-456': { nickname: 'ben', score: 0 },                  // sign-in failed: no uid
            '-Nabc_DEF-789': { nickname: 'ana', score: 0, uid: 'uid-ana' },  // ana joined again (a refresh): a new id
        },
    }, owner);

    // ---- every real pick is accepted ----
    for (let id = 0; id < names.length; id++) {
        await rest('PUT', `games/${PIN}/state`, { id, timestamp: 1 + id }, owner);
        await rest('DELETE', picks, undefined, owner);
        const phase = names[id];
        await accepted(`${phase}: a pick, phone not signed in`, 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'the truth' }, phone);
        await accepted(`${phase}: a pick, phone signed in`, 'PUT', `${picks}/-Nabc_DEF-123`, { text: 'a lie' }, signedIn('uid-ana'));
        await accepted(`${phase}: a pick after joining again`, 'PUT', `${picks}/-Nabc_DEF-789`, { text: 'a lie' }, signedIn('uid-ana'));
        await accepted(`${phase}: the same pick written twice`, 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'the truth' }, phone);
        await accepted(`${phase}: a pick in Hebrew`, 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'תשובה ארוכה מאוד עם רווחים, פסיקים ו-123' }, phone);
        await accepted(`${phase}: a pick as long as an answer can get`, 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'x'.repeat(500) }, phone);
        await accepted(`${phase}: a pick that names its picks step (today's site)`, 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'a lie', step: '4:1763060000000' }, phone);
        const read = await rest('GET', `${picks}/-Nabc_DEF-456`, undefined, phone);
        assert.ok(read.ok && read.json && read.json.text, `${phase}: a phone can read its pick back`);
    }

    // A player who joins late (the server adds them) can pick at once.
    await rest('PUT', `games/${PIN}/state`, { id: 3, timestamp: 99 }, owner);
    await rest('PUT', `games/${PIN}/players/-Nlate_0001`, { nickname: 'cat', score: 0, uid: 'uid-cat' }, server);
    await accepted('a pick by a player who joined after the game began', 'PUT', `${picks}/-Nlate_0001`, { text: 'a lie' }, signedIn('uid-cat'));

    // ---- what is not a player's pick is refused ----
    for (const who of [phone, signedIn('uid-ana'), signedIn('someone-else')]) {
        await refused('a pick under an id that is no player\'s', 'PUT', `${picks}/nobody`, { text: 'a lie' }, who);
        await refused('a pick under "constructor"', 'PUT', `${picks}/constructor`, { text: 'a lie' }, who);
        await refused('a pick under another game\'s player id', 'PUT', `${picks}/-Nother_GAME`, { text: 'a lie' }, who);
        await refused('a pick that is only a string', 'PUT', `${picks}/-Nabc_DEF-456`, 'the truth', who);
        await refused('a pick that is only a number', 'PUT', `${picks}/-Nabc_DEF-456`, 7, who);
        await refused('a pick with no text', 'PUT', `${picks}/-Nabc_DEF-456`, { nope: 'x' }, who);
        await refused('a pick whose text is a number', 'PUT', `${picks}/-Nabc_DEF-456`, { text: 7 }, who);
        await refused('a pick whose text is empty', 'PUT', `${picks}/-Nabc_DEF-456`, { text: '' }, who);
        await refused('a pick whose text is too long', 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'x'.repeat(501) }, who);
        await refused('a pick that brings its own points', 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'the truth', score: 99999 }, who);
        await refused('a pick whose step is not text', 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'a lie', step: 7 }, who);
        await refused('a pick whose step is too long', 'PUT', `${picks}/-Nabc_DEF-456`, { text: 'a lie', step: 'x'.repeat(41) }, who);
        await refused('points added to a pick', 'PUT', `${picks}/-Nabc_DEF-456/score`, 99999, who);
        await refused('anything else added to a pick', 'PATCH', `${picks}/-Nabc_DEF-456`, { extra: 'x' }, who);
        await refused('removing a pick', 'DELETE', `${picks}/-Nabc_DEF-456`, undefined, who);
        await refused('removing every pick', 'DELETE', picks, undefined, who);
        await refused('replacing every pick', 'PUT', picks, { '-Nabc_DEF-456': { text: 'a lie' } }, who);
        await refused('several picks at once, one of them no player\'s', 'PATCH', picks, { '-Nabc_DEF-456': { text: 'a lie' }, nobody: { text: 'a lie' } }, who);
    }
    await refused('a pick in a game that does not exist', 'PUT', 'games/NONE/answerSelections/-Nabc_DEF-456', { text: 'a lie' }, phone);

    // ---- the server's own writes are always accepted ----
    await accepted('server: picks with their points, as it writes them when picking closes', 'PATCH', `games/${PIN}`, {
        answerSelections: {
            '-Nabc_DEF-123': { text: 'a lie', score: 0 },
            '-Nabc_DEF-456': { text: 'the truth', score: 1000 },
            '-Nabc_DEF-789': { text: 'house lie', score: -250 },
        },
        state: { id: 4, timestamp: 100 },
    }, server);
    await accepted('server: no picks left at all', 'PATCH', `games/${PIN}`, { answerSelections: {}, state: { id: 5, timestamp: 101 } }, server);
    await accepted('server: picks cleared for the next question', 'PATCH', `games/${PIN}`, { answerSelections: null, state: { id: 2, timestamp: 102 } }, server);
    // Even picks it would no longer write itself (a game that was running when the rule arrived).
    await accepted('server: a pick of any shape', 'PATCH', `games/${PIN}`, { answerSelections: { old: { text: 'x'.repeat(900), score: 5, more: true } } }, server);

    await rest('DELETE', `games/${PIN}`, undefined, owner);
    console.log(`PASS: ${checks} checks`);
    process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
