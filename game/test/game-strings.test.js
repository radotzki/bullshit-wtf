// Tests for the words of the game's own screens (src/app/pages/game-strings.ts).
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const app = path.join(__dirname, '..', 'src', 'app');
const { gameStrings } = load(path.join(app, 'pages', 'game-strings.ts'));
const { lobbyText } = load(path.join(app, 'pages', 'game-staging', 'lobby-host.ts'));

/** Every word of a language, with the functions called on sample values. */
function words(t) {
    const samples = {
        pin: ['ABCD'], round: [2], questionOf: [3, 7], scanLabel: ['ABCD'], points: [500],
        leadsBy: ['Dan', 500], tiedForFirst: ['Dan and Ben'], manyTiedForFirst: [4], youLeadBy: [500],
        youAreTiedWith: ['Ben'], youAreTiedWithMany: [3], behind: [500, 'Dan'], behindFirstPlace: [1500],
        foundTheTruth: ['+1000'], fellForOurs: ['-500'], fellFor: ['Dan'], fooled: ['Dan and Ben', '+500'],
        youFooled: ['Dan and Ben'],
        waitingForName: ['Dan'], seatIn: ['Dan'], seatNotYet: ['Dan'],
    };
    const out = {};
    for (const key of Object.keys(t)) {
        const v = t[key];
        if (typeof v !== 'function') {
            out[key] = v;
        } else if (key === 'waitingFor') {
            out[key] = [v(1), v(3)];
        } else if (key === 'names') {
            out[key] = [v([]), v(['Dan']), v(['Dan', 'Ben']), v(['Dan', 'Ben', 'Gal'])];
        } else if (key === 'signed') {
            out[key] = [v(500), v(0), v(-500)];
        } else {
            out[key] = v.apply(null, samples[key]);
        }
    }
    return out;
}

test('every game that is not Hebrew keeps the English words, letter for letter', () => {
    const en = gameStrings('en');
    assert.strictEqual(gameStrings(undefined), en);
    assert.strictEqual(gameStrings(null), en);
    assert.strictEqual(gameStrings('fr'), en);
    assert.deepStrictEqual(words(en), {
        lang: 'en',
        dir: 'ltr',
        rtl: false,
        start: 'START',
        pin: 'PIN: ABCD',
        round: 'ROUND 2',
        questionOf: '3 OF 7',
        joinAt: 'Join at',
        withPin: 'with Game PIN:',
        leaveTitle: 'Don\'t leave us :(',
        leaveText: 'Do you want to leave this awesome game?',
        keepPlaying: 'KEEP PLAYING',
        backHome: 'BACK HOME',
        waitingForPlayers: 'Waiting for players..',
        onlyHostStarts: 'Only the host can start this game',
        inviteFriends: 'INVITE FRIENDS',
        inviteHint: 'Let them scan this, or send them the link',
        shareLink: 'SHARE LINK',
        whatsapp: 'WHATSAPP',
        copyLink: 'COPY LINK',
        linkCopied: 'LINK COPIED',
        done: 'DONE',
        scanToJoin: 'SCAN TO JOIN',
        scanLabel: 'Scan to join game ABCD',
        points: '500 points',
        forEveryoneYouBullshit: 'for everyone you bullshit',
        forFindingTheTruth: 'for finding the truth',
        finalQuestion: 'FINAL QUESTION',
        leadsBy: 'Dan leads by 500 points',
        tiedForFirst: 'Dan and Ben are tied for first',
        manyTiedForFirst: '4 players are tied for first',
        youLeadBy: 'You lead by 500 points',
        youAreTiedWith: 'You are tied for first with Ben',
        youAreTiedWithMany: 'You are tied for first with 3 others',
        behind: '500 points behind Dan',
        behindFirstPlace: '1500 points behind first place',
        send: 'SEND',
        tooCloseToTruth: 'You entered the correct answer! Try something else',
        answerSubmitted: 'Your answer has been submitted',
        whatWasTheQuestion: 'WHAT WAS THE QUESTION AGAIN?',
        waitForFriends: 'Let\'s wait for your friends',
        waitingForName: 'Waiting for Dan',
        seatIn: 'Dan is in',
        seatNotYet: 'Dan, not yet',
        pickedBy: 'picked by',
        truthIs: 'AND THE TRUTH IS…',
        foundBy: 'found by',
        youFooled: 'You fooled Dan and Ben!',
        soundOn: 'Sound is on. Tap to mute',
        soundOff: 'Sound is off. Tap to unmute',
        nobodyFoundIt: 'nobody found it',
        theTruth: 'THE TRUTH',
        houseLie: 'Home Grown Bullshit',
        bullshitBy: 'bullshit by',
        nobodyFellFor: 'Nobody fell for:',
        next: 'NEXT',
        waitingFor: ['Waiting for 1 friend', 'Waiting for 3 friends'],
        foundTheTruth: 'You found the truth! +1000',
        fellForOurs: 'You fell for our bullshit. -500',
        fellForOursNoPoints: 'You fell for our bullshit. No points to lose yet!',
        fellFor: 'You fell for Dan\'s bullshit.',
        didNotPick: 'You didn\'t pick an answer.',
        fooled: 'You fooled Dan and Ben! +500',
        nobodyFellForYours: 'Nobody fell for your answer.',
        names: ['', 'Dan', 'Dan and Ben', 'Dan, Ben and Gal'],
        signed: ['+500', '0', '-500'],
        oops: 'oops, something went wrong. Please try again',
    });
});

test('a Hebrew game has a Hebrew word for every English one, and reads right to left', () => {
    const en = words(gameStrings('en'));
    const he = words(gameStrings('he'));
    assert.deepStrictEqual(Object.keys(he), Object.keys(en));
    assert.strictEqual(he.lang, 'he');
    assert.strictEqual(he.dir, 'rtl');
    assert.strictEqual(he.rtl, true);

    for (const key of Object.keys(en)) {
        if (['lang', 'dir', 'rtl', 'signed'].indexOf(key) !== -1) {
            continue;
        }
        for (const line of [].concat(he[key]).filter(l => l !== '')) {
            if (key === 'names' && !/ /.test(line)) {
                continue; // one name alone has no word of ours in it
            }
            assert.match(line, /[א-ת]/, `${key} is in Hebrew`);
            // No English word of ours is left: only the sample names, PIN and numbers may be Latin.
            assert.doesNotMatch(line.replace(/Dan|Ben|Gal|ABCD|and/g, ''), /[A-Za-z]/, `${key} has no English left`);
        }
    }
});

test('Hebrew lines keep the players\' names, the PIN and the numbers', () => {
    const he = gameStrings('he');
    assert.ok(he.pin('ABCD').indexOf('ABCD') !== -1);
    assert.ok(he.scanLabel('ABCD').indexOf('ABCD') !== -1);
    assert.strictEqual(he.round(2), 'סיבוב 2');
    assert.strictEqual(he.questionOf(3, 7), '3 מתוך 7');
    assert.strictEqual(he.points(750), '750 נקודות');
    assert.strictEqual(he.waitingFor(1), 'מחכים לחבר אחד');
    assert.ok(he.waitingFor(3).indexOf('3') !== -1);
    assert.strictEqual(he.names(['דנה']), 'דנה');
    assert.strictEqual(he.names(['דנה', 'בן']), 'דנה ו־בן');
    assert.strictEqual(he.names(['דנה', 'בן', 'גל']), 'דנה, בן ו־גל');
    assert.ok(he.fellFor('בן').indexOf('בן') !== -1);
    assert.ok(he.fooled('דנה ו־בן', '+500').indexOf('דנה ו־בן') !== -1);
});

test('a points line never prints a number that is not read yet', () => {
    for (const t of [gameStrings('en'), gameStrings('he')]) {
        for (const missing of [undefined, null, NaN]) {
            assert.strictEqual(t.points(missing), '');
        }
        assert.ok(t.points(0).indexOf('0') === 0);
        assert.ok(!/undefined|null|NaN/.test(t.points(1000)));
    }
});

test('points in a Hebrew line keep their sign in front of the number', () => {
    const he = gameStrings('he');
    // Held left to right (U+2066 ... U+2069), or a right-to-left line would show "500+".
    assert.strictEqual(he.signed(500), '⁦+500⁩');
    assert.strictEqual(he.signed(-500), '⁦-500⁩');
    assert.strictEqual(he.signed(0), '⁦0⁩');
    assert.ok(he.foundTheTruth(he.signed(1000)).indexOf('⁦+1000⁩') !== -1);
});

test('the Hebrew lobby names the start button by the word that is on it', () => {
    const start = gameStrings('he').start;
    const canStart = { canStart: true, wait: 'none', hostName: null, alone: false };
    assert.ok(lobbyText(canStart, 3, 'he').message.indexOf(`"${start}"`) !== -1);
    assert.ok(lobbyText(canStart, 2, 'he', 'בן').message.indexOf(`"${start}"`) !== -1);
    assert.ok(lobbyText(Object.assign({ hostGone: 'דנה' }, canStart), 3, 'he').message.indexOf(`"${start}"`) !== -1);
    assert.doesNotMatch(lobbyText(canStart, 3, 'he').message, /START/);
    // English lobbies still say START, as the button does.
    assert.ok(lobbyText(canStart, 3, 'en').message.indexOf(gameStrings('en').start) !== -1);
});
