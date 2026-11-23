// The AirConsole controller (each player's phone): it takes a seat in the screen's game on the game's
// own server, under the player's AirConsole nickname, and shows what the site's phone shows at each
// step: write a lie, pick the truth, how it went, the scores. What the game is on comes from the
// screen (its AirConsole device state); what the player does goes straight to the server.

/* global AirConsole */

import { gameStrings } from '../../game/src/app/pages/game-strings';
import { finalStrings } from '../../game/src/app/pages/score-board-final/final-strings';
import { airStrings } from './strings';
import * as V from './view';
import { keyboard } from './keyboard';
import { signIn, uidWithin, call, write } from './backend';

const GS = V.GameState;
const RETRY_MS = 3000;

const air = new AirConsole({ orientation: AirConsole.ORIENTATION_PORTRAIT, silence_inactive_players: false });
const app = document.getElementById('app');

let shared = null;
let endsAt = null;
let revealAt = null;
let me = { pin: null, pid: null, nickname: '', joining: false, full: false, failed: false, late: false };
let sent = { key: '', text: '' };
let picked = { key: '', text: '' };
let nexted = '';
let draft = '';
let wrong = '';
let busy = false;
let kb = null;
let drawn = '';

const esc = s => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lang = () => (shared && shared.pin ? shared.locale : V.localeFor(air.getLanguage()));
const words = () => ({ t: gameStrings(lang()), f: finalStrings[lang() === 'he' ? 'he' : 'en'], a: airStrings(lang()) });
const isMaster = () => !!shared && shared.master === air.getDeviceId();
const toScreen = data => air.message(AirConsole.SCREEN, data);

function remember(pin, pid) {
    try {
        localStorage.setItem(`bs-airconsole-${pin}`, pid);
    } catch (e) { /* private mode: the seat is not kept for a reload */ }
}

function remembered(pin) {
    try {
        return localStorage.getItem(`bs-airconsole-${pin}`);
    } catch (e) {
        return null;
    }
}

air.onReady = function () {
    signIn();
    render();
    const state = air.getCustomDeviceState(AirConsole.SCREEN);
    if (state) {
        onShared(state);
    }
    toScreen({ type: 'hello' });
    setInterval(timer, 250);
};

air.onCustomDeviceStateChange = function (deviceId, data) {
    if (deviceId === AirConsole.SCREEN) {
        onShared(data);
    }
};

air.onConnect = () => render();
air.onDisconnect = () => render();

function onShared(state) {
    if (!state || typeof state !== 'object') {
        return;
    }
    const before = shared;
    shared = state;
    const newStep = !before || before.key !== state.key;
    if (newStep) {
        endsAt = typeof state.endsIn === 'number' ? Date.now() + state.endsIn : null;
        wrong = '';
    }
    // The reveal's rows can reach the screen a moment after its step: count from the latest rows.
    if (newStep || JSON.stringify(before.reveal || null) !== JSON.stringify(state.reveal || null)) {
        revealAt = typeof state.revealIn === 'number' ? Date.now() + state.revealIn : null;
    }
    if (state.pin && state.pin !== me.pin) {
        join(state.pin);
    }
    render();
}

async function join(pin) {
    me = { pin, pid: null, nickname: air.getNickname() || '', joining: true, full: false, failed: false,
        late: !!shared && shared.step !== GS.GameStaging };
    sent = { key: '', text: '' };
    picked = { key: '', text: '' };
    draft = '';
    render();
    try {
        const { uid } = await uidWithin(1500);
        const resp = await call('join', { pin, nickname: me.nickname, uid: uid || null, hostKey: null, pid: remembered(pin) });
        if (me.pin !== pin) {
            return;
        }
        me.pid = resp.pid;
        me.nickname = resp.nickname || me.nickname;
        me.joining = false;
        remember(pin, resp.pid);
        // The join that counts this phone as a weekly player (the users table), as the site sends it.
        signIn().then(id => id && call('onJoinGame', { uid: id, pin, nickname: me.nickname, via: V.AIRCONSOLE_TAG })
            .catch(() => { }));
    } catch (e) {
        if (me.pin !== pin) {
            return;
        }
        me.joining = false;
        if (e.code === 'GAME_IS_FULL') {
            me.full = true;
        } else {
            me.failed = true;
            setTimeout(() => {
                if (me.pin === pin && !me.pid && !me.full) {
                    me.pin = null;
                    join(pin);
                }
            }, RETRY_MS);
        }
    }
    render();
}

async function sendLie() {
    const text = draft.trim();
    if (!text || busy || !shared) {
        return;
    }
    const key = shared.key;
    busy = true;
    wrong = '';
    render(true);
    try {
        await call('answer', { pin: me.pin, answer: text, pid: me.pid });
        sent = { key, text };
        draft = '';
    } catch (e) {
        wrong = e.code === 'CORRECT_ANSWER' ? words().t.tooCloseToTruth : words().t.oops;
    }
    busy = false;
    render(true);
}

async function pick(text) {
    if (!shared || busy) {
        return;
    }
    const key = shared.key;
    busy = true;
    try {
        await write(`games/${me.pin}/answerSelections/${me.pid}`, { text: text.toLowerCase(), step: key });
        picked = { key, text };
    } catch (e) {
        wrong = words().t.oops;
    }
    busy = false;
    render(true);
}

function next() {
    if (!shared) {
        return;
    }
    nexted = shared.key;
    write(`games/${me.pin}/revealDone/${me.pid}`, true).catch(() => { });
    render(true);
}

app.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-do]');
    if (!b || b.disabled) {
        return;
    }
    const act = b.getAttribute('data-do');
    if (act === 'start') {
        toScreen({ type: 'start' });
    } else if (act === 'locale') {
        toScreen({ type: 'locale' });
    } else if (act === 'again') {
        toScreen({ type: 'again' });
    } else if (act === 'send') {
        sendLie();
    } else if (act === 'clear') {
        draft = '';
        if (kb) {
            kb.clear();
        }
    } else if (act === 'pick') {
        pick(b.getAttribute('data-text'));
    } else if (act === 'next') {
        next();
    }
});

function timer() {
    const bar = document.getElementById('progress');
    if (bar && endsAt && shared && typeof shared.endsIn === 'number') {
        const total = Math.max(1, shared.endsIn);
        bar.style.width = `${Math.max(0, Math.min(100, 100 * (endsAt - Date.now()) / total))}%`;
    }
    // The reveal: the player's own lines once every row is on the big screen.
    if (shared && shared.step === GS.RevealTheTruth && revealAt && Date.now() >= revealAt) {
        revealAt = null;
        render();
    }
}

function avatar(n) {
    return `<div class="avatar" style="background-image:url(assets/avatar${n}.png)"></div>`;
}

function myRow() {
    return (shared && shared.players || []).filter(p => p.pid === me.pid)[0] || null;
}

function playersObject() {
    const o = {};
    (shared && shared.players || []).forEach(p => { o[p.pid] = { nickname: p.nickname, score: p.score }; });
    return o;
}

function body() {
    const { t, f, a } = words();
    const mine = myRow();
    const top = `<div class="me">${mine ? avatar(mine.avatar) : ''}<span>${esc(me.nickname || air.getNickname() || '')}</span>
        ${mine && shared.step !== GS.GameStaging ? `<span class="my-score">${esc(a.yourScore(mine.score))}</span>` : ''}</div>`;

    if (!shared || !shared.pin) {
        return `${top}<main class="center"><div class="big-logo"></div><p>${esc(a.connecting)}</p></main>`;
    }
    if (me.full) {
        return `${top}<main class="center"><p>${esc(a.gameFull)}</p></main>`;
    }
    if (!me.pid) {
        return `${top}<main class="center"><div class="big-logo"></div><p>${esc(me.failed ? a.joinFailed : a.joining)}</p></main>`;
    }
    const step = shared.step;
    const key = shared.key;

    if (step === GS.GameStaging) {
        const count = (shared.players || []).length;
        const masterName = shared.master !== null && shared.master !== undefined ? air.getNickname(shared.master) : '';
        return `${top}<main class="center lobby">
            <p class="big">${esc(a.youreIn)}</p>
            ${isMaster() ? `
                <p>${esc(count >= V.MIN_PLAYERS ? a.youStart : a.needMore(V.MIN_PLAYERS - count))}</p>
                <button class="button primary" data-do="start" ${count >= V.MIN_PLAYERS ? '' : 'disabled'}>${esc(t.start)}</button>
                <button class="button light" data-do="locale">${esc(a.switchLanguage)}</button>`
        : `<p>${esc(masterName ? a.waitStart(masterName) : '')}</p>`}
        </main>`;
    }
    const late = me.late ? `<p class="note">${esc(a.lateJoin)}</p>` : '';
    if (step === GS.RoundIntro) {
        return `${top}<main class="center"><p class="big">${esc(a.lookAtScreen)}</p>${late}</main>`;
    }
    if (step === GS.ShowQuestion) {
        if (sent.key === key) {
            return `${top}<main class="center"><p class="big">${esc(t.answerSubmitted)}</p><p>${esc(a.lookAtScreen)}</p></main>`;
        }
        return `${top}<div class="progress-track"><div id="progress" class="progress"></div></div>
            <main class="write">
            <p class="question">${esc(V.questionText(shared.question))}</p>
            <div class="lie-box"><div id="lie" class="lie ${draft ? '' : 'empty'}">${esc(draft || a.yourLie)}</div>
                <button class="button light small" data-do="clear">${esc(a.clear)}</button></div>
            ${wrong ? `<p class="wrong">${esc(wrong)}</p>` : ''}
            <button class="button primary" data-do="send" ${draft.trim() && !busy ? '' : 'disabled'}>${esc(t.send)}</button>
            <div id="keyboard" class="keyboard"></div>
            ${late}
        </main>`;
    }
    if (step === GS.ShowAnswers) {
        if (picked.key === key) {
            return `${top}<main class="center"><p class="big">${esc(t.waitForFriends)}</p></main>`;
        }
        const picks = V.pickList(shared.picks, me.pid);
        return `${top}<div class="progress-track"><div id="progress" class="progress"></div></div>
            <main class="pick"><p class="question small">${esc(V.questionText(shared.question))}</p>
            <p>${esc(a.pickTruth)}</p>
            ${picks.map(p => `<button class="button pick-button" data-do="pick" data-text="${esc(p)}">${esc(p)}</button>`).join('')}
            ${wrong ? `<p class="wrong">${esc(wrong)}</p>` : ''}
        </main>`;
    }
    if (step === GS.RevealTheTruth) {
        if (revealAt) {
            return `${top}<main class="center"><p class="big">${esc(a.lookAtScreen)}</p></main>`;
        }
        const lines = V.myResult(me.pid, shared.reveal || [], playersObject(), t);
        return `${top}<main class="center result">
            ${lines.map(l => `<p class="result-line">${esc(l)}</p>`).join('')}
            ${nexted === key ? '' : `<button class="button primary" data-do="next">${esc(t.next)}</button>`}
        </main>`;
    }
    if (step === GS.ScoreBoard || step === GS.ScoreBoardFinal) {
        const list = V.ranking(playersObject());
        const row = list.filter(p => p.pid === me.pid)[0];
        const tie = list.filter(p => p.place === 1).length > 1;
        const final = step === GS.ScoreBoardFinal;
        const placeLine = row ? (final && row.place === 1 ? (tie ? f.youTied : f.youWon) : a.place(row.place, list.length)) : '';
        return `${top}<main class="center">
            <p class="big">${esc(row ? a.yourScore(row.score) : '')}</p>
            <p>${esc(placeLine)}</p>
            ${final && isMaster() ? `<button class="button primary" data-do="again">${esc(a.playAgain)}</button>` : ''}
            ${final && !isMaster() ? `<p>${esc(a.lookAtScreen)}</p>` : ''}
        </main>`;
    }
    return `${top}<main class="center"><p>${esc(a.lookAtScreen)}</p></main>`;
}

function render(force) {
    const { t } = words();
    document.documentElement.lang = lang();
    document.documentElement.dir = t.dir;
    const html = body();
    if (!force && html === drawn) {
        return;
    }
    drawn = html;
    app.innerHTML = html;
    const box = document.getElementById('keyboard');
    if (box) {
        kb = keyboard(box, {
            layout: lang(),
            t: words().a,
            onChange: text => {
                draft = text;
                const lie = document.getElementById('lie');
                if (lie) {
                    lie.textContent = draft || words().a.yourLie;
                    lie.classList.toggle('empty', !draft);
                }
                const send = app.querySelector('[data-do="send"]');
                if (send) {
                    send.disabled = !draft.trim() || busy;
                }
            },
        });
        kb.setText(draft);
    } else {
        kb = null;
    }
}

render();
