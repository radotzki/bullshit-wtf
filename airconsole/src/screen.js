// The AirConsole screen (the TV or computer): it makes the game on the game's own server, holds its
// host key, shows every step as the site's big screen (Present Game) does, and shares what the phones
// need through AirConsole. The phones are the players; this screen never plays.

/* global AirConsole */

import { gameStrings } from '../../game/src/app/pages/game-strings';
import { finalStrings } from '../../game/src/app/pages/score-board-final/final-strings';
import { airStrings } from './strings';
import * as V from './view';
import { uidWithin, call, watch, write, serverOffset, reconnect, signIn } from './backend';

const GS = V.GameState;
const RETRY_MS = 5000;
const FIELDS = ['state', 'players', 'currentQ', 'answers', 'revealAnswers', 'roundIndex', 'questionIndex', 'totalQ',
    'highlights', 'timestamp', 'locale', 'idle'];

const air = new AirConsole({ orientation: AirConsole.ORIENTATION_LANDSCAPE, silence_inactive_players: false });
const app = document.getElementById('app');

let locale = 'en';
let game = { pin: null };
let hostKey = null;
let offset = 0;
let stops = [];
let creating = false;
let pingTimer = null;
let tickTimer = null;
let lastShared = '';
let pendingAgain = false;
let failed = false;

const esc = s => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const serverNow = () => Date.now() + offset;
const words = () => ({ t: gameStrings(game.locale || locale), f: finalStrings[(game.locale || locale) === 'he' ? 'he' : 'en'], a: airStrings(game.locale || locale) });
const master = () => air.getMasterControllerDeviceId();
const masterName = () => {
    const id = master();
    return id === undefined ? '' : air.getNickname(id);
};

air.onReady = function () {
    locale = V.localeFor(air.getLanguage(AirConsole.SCREEN));
    signIn();
    serverOffset(v => { offset = v; });
    newGame(locale);
    setInterval(tick, 250);
};

air.onConnect = () => { share(); render(); };
air.onDisconnect = () => { share(); render(); };
air.onPause = () => { /* the server keeps time: nothing on the screen can be paused */ };
air.onResume = () => { reconnect(); };
air.onAdShow = () => { document.body.classList.add('ad'); };
air.onAdComplete = () => {
    document.body.classList.remove('ad');
    if (pendingAgain) {
        pendingAgain = false;
        newGame(game.locale || locale);
    }
};

air.onMessage = function (from, data) {
    if (!data || typeof data !== 'object') {
        return;
    }
    const step = game.state ? game.state.id : null;
    const isMaster = from === master();
    if (data.type === 'hello') {
        lastShared = '';
        share();
    } else if (data.type === 'start' && isMaster && step === GS.GameStaging) {
        if (V.seats(game.players || {}).length >= V.MIN_PLAYERS) {
            call('startGame', { pin: game.pin, hostKey }).catch(e => console.warn('START failed', e.code));
        }
    } else if (data.type === 'locale' && isMaster && step === GS.GameStaging) {
        newGame((game.locale || locale) === 'he' ? 'en' : 'he');
    } else if (data.type === 'again' && isMaster && step === GS.ScoreBoardFinal && !creating) {
        // A game is over: AirConsole's ad break comes here (its checklist: after each level), then a new game.
        pendingAgain = true;
        air.showAd();
    }
};

async function newGame(lang) {
    if (creating) {
        return;
    }
    creating = true;
    failed = false;
    locale = lang;
    render();
    try {
        const key = V.newHostKey();
        const { uid, waitedMs } = await uidWithin(1500);
        const resp = await call('newGame', V.newGameBody(lang, uid, key, waitedMs));
        if (!resp || !resp.pin) {
            throw new Error('no PIN');
        }
        // The screen is the big screen and the host: it holds the key and starts the game, and takes no seat.
        await call('hostToBigScreen', { pin: resp.pin, hostKey: key });
        hostKey = key;
        follow(resp.pin, lang);
    } catch (e) {
        console.warn('could not open a game', e && (e.code || e.message));
        failed = true;
        setTimeout(() => newGame(lang), RETRY_MS);
    } finally {
        creating = false;
        render();
    }
}

function follow(pin, lang) {
    stops.forEach(stop => stop());
    stops = [];
    game = { pin, locale: lang };
    lastShared = '';
    FIELDS.forEach(field => {
        stops.push(watch(`games/${pin}/${field}`, value => {
            game[field] = value;
            if (field === 'state') {
                onState();
            }
            share();
            render();
        }));
    });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
        if (game.pin === pin && game.state && game.state.id === GS.GameStaging) {
            call('hostHere', { pin, hostKey }).catch(() => { });
        }
    }, V.HOST_PING_MS);
}

/** A new step: if the server is late to end it, nudge it, as the site's big screen does. */
function onState() {
    clearTimeout(tickTimer);
    const state = game.state;
    if (!state || typeof state.deadline !== 'number') {
        return;
    }
    const key = V.phaseKey(state);
    const pin = game.pin;
    tickTimer = setTimeout(() => {
        if (game.pin === pin && V.phaseKey(game.state) === key) {
            write(`games/${pin}/tick`, key).catch(() => { });
        }
    }, Math.max(0, state.deadline - serverNow()) + V.TICK_FALLBACK_MS);
}

/** Shares the step with the phones through this screen's AirConsole device state, when it changed. */
function share() {
    if (!game.pin) {
        return;
    }
    const reveal = game.state && game.state.id === GS.RevealTheTruth ? V.revealTimes(game.revealAnswers) : null;
    const shared = V.sharedState(game, {
        serverNow: serverNow(),
        master: master(),
        revealAllShown: reveal ? Math.max(0, game.state.timestamp + reveal.allShown - serverNow()) : null,
    });
    const same = JSON.stringify(Object.assign({}, shared, { endsIn: null, revealIn: null }));
    if (same === lastShared) {
        return;
    }
    lastShared = same;
    air.setCustomDeviceState(shared);
}

function tick() {
    const bar = document.getElementById('progress');
    if (bar && game.state && typeof game.state.deadline === 'number') {
        const total = game.state.deadline - game.state.timestamp;
        const left = Math.max(0, game.state.deadline - serverNow());
        bar.style.width = `${total > 0 ? (100 * left / total) : 0}%`;
        bar.classList.toggle('panic', left < 5000);
    }
    if (game.state && game.state.id === GS.RevealTheTruth) {
        renderReveal();
    }
}

function avatar(p, cls) {
    return `<div class="avatar ${cls || ''}" style="background-image:url(assets/avatar${p.avatar}.png)"></div>`;
}

function seatList(list, opts) {
    return `<div class="seats">${list.map(p => `
        <div class="seat ${opts && opts.waiting ? (p.done ? 'done' : (p.away ? 'away' : 'not-yet')) : ''}">
            ${avatar(p)}<div class="name">${esc(p.nickname)}</div>
            ${opts && opts.scores ? `<div class="score">${esc(p.score)}</div>` : ''}
        </div>`).join('')}</div>`;
}

function header(t, a) {
    const s = game.state;
    const right = s && s.id !== GS.GameStaging && typeof game.questionIndex === 'number'
        ? esc(a.round(game.questionIndex + 1, game.totalQ || V.QUESTIONS)) : '';
    return `<header><div class="logo"></div><div class="header-right">${right}</div></header>`;
}

function render() {
    const lang = game.locale || locale;
    const { t, f, a } = words();
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.body.className = document.body.className.replace(/\bstep-\S+/g, '').trim();

    const s = game.state;
    if (!game.pin || !s) {
        document.body.classList.add('step-loading');
        app.innerHTML = `${header(t, a)}<main class="center"><div class="big-logo"></div>
            <p class="line">${esc(failed ? a.noGame : a.loading)}</p></main>`;
        return;
    }
    document.body.classList.add(`step-${s.id}`);
    const players = game.players || {};

    if (s.id === GS.GameStaging) {
        const list = V.seats(players);
        const name = masterName();
        app.innerHTML = `${header(t, a)}<main class="lobby">
            <div class="big-logo"></div>
            <p class="tagline">${esc(a.tagline)}</p>
            <p class="line">${esc(list.length ? a.players(list.length, V.MAX_PLAYERS) : a.joinWithPhones)}</p>
            ${seatList(list)}
            <p class="line strong">${esc(V.lobbyLine(list.length, name, a))}</p>
            <p class="hint">${esc(a.languageLine)}</p>
        </main>`;
    } else if (s.id === GS.RoundIntro) {
        const round = typeof game.roundIndex === 'number' ? game.roundIndex : 0;
        const points = V.ROUND_POINTS[round] || {};
        const last = (game.questionIndex || 0) + 1 >= (game.totalQ || V.QUESTIONS);
        app.innerHTML = `${header(t, a)}<main class="center round">
            <h1>${esc(last ? t.finalQuestion : t.round(round + 1))}</h1>
            <p class="points"><b>${esc(t.points(points.truth))}</b> ${esc(t.forFindingTheTruth)}</p>
            <p class="points"><b>${esc(t.points(points.bullshit))}</b> ${esc(t.forEveryoneYouBullshit)}</p>
        </main>`;
    } else if (s.id === GS.ShowQuestion || s.id === GS.ShowAnswers) {
        const asking = s.id === GS.ShowQuestion;
        const row = V.waiting(players, s, game.questionIndex, game.timestamp);
        const picks = asking ? [] : V.pickList(game.answers, null);
        app.innerHTML = `${header(t, a)}<div class="progress-track"><div id="progress" class="progress"></div></div>
            <main class="question-step">
            <p class="question">${esc(V.questionText(game.currentQ))}</p>
            ${asking ? '' : `<div class="answers">${picks.map(p => `<div class="answer">${esc(p)}</div>`).join('')}</div>`}
            <p class="line">${esc(asking ? a.writeOnPhone : a.pickOnPhone)}</p>
            ${seatList(row, { waiting: true })}
        </main>`;
    } else if (s.id === GS.RevealTheTruth) {
        app.innerHTML = `${header(t, a)}<main class="reveal"><p class="question small">${esc(V.questionText(game.currentQ))}</p>
            <div id="reveal-rows" class="reveal-rows"></div></main>`;
        renderReveal(true);
    } else if (s.id === GS.ScoreBoard) {
        app.innerHTML = `${header(t, a)}<main class="scores">${scoreTable(players)}</main>`;
    } else if (s.id === GS.ScoreBoardFinal) {
        const top = V.winners(players);
        const hl = V.finalHighlights(players, game.highlights);
        const name = masterName();
        app.innerHTML = `${header(t, a)}<main class="final">
            <h1>${esc(game.idle ? f.gameOver : (top.length === 1 ? f.wins(top[0].nickname) : (top.length ? f.tie : f.gameOver)))}</h1>
            ${game.idle ? `<p class="line">${esc(f.idle)}</p>` : ''}
            ${scoreTable(players)}
            ${hl.biggest.length ? `<p class="award"><b>${esc(f.biggest)}</b> ${esc(t.names(hl.biggest))}</p>` : ''}
            ${hl.bestLie ? `<p class="award">${esc(a.bestLie(hl.bestLie.nickname, hl.bestLie.text))}</p>` : ''}
            ${name ? `<p class="hint">${esc(a.playAgainFrom(name))}</p>` : ''}
        </main>`;
    }
}

function scoreTable(players) {
    return `<ol class="ranking">${V.ranking(players).map(p => `
        <li>${avatar(p, 'small')}<span class="place">${p.place}</span><span class="name">${esc(p.nickname)}</span>
        <span class="score">${esc(p.score)}</span></li>`).join('')}</ol>`;
}

let revealDrawn = '';

/** The reveal, row by row on the site's big-screen timing (game-model's revealSchedule). */
function renderReveal(force) {
    const box = document.getElementById('reveal-rows');
    if (!box || !game.state) {
        return;
    }
    const { t } = words();
    const view = V.revealView(game.revealAnswers, game.players || {});
    const times = V.revealTimes(game.revealAnswers);
    const elapsed = serverNow() - game.state.timestamp;
    const html = view.rows.map((r, i) => {
        if (elapsed < times.starts[i]) {
            return '';
        }
        const writer = elapsed >= times.starts[i] + times.writerAt;
        const who = r.realAnswer ? t.theTruth : (r.houseLie ? t.houseLie : `${t.bullshitBy} ${t.names(r.writers)}`);
        return `<div class="reveal-row ${r.realAnswer ? 'truth' : (r.houseLie ? 'house' : 'lie')}">
            <div class="reveal-text">${esc(r.text)}</div>
            <div class="reveal-pickers">${r.pickers.length ? `${esc(t.pickedBy)} ${esc(t.names(r.pickers))}` : esc(r.realAnswer ? t.nobodyFoundIt : '')}</div>
            ${writer ? `<div class="reveal-writer">${esc(who)} <span class="points">${esc(t.signed(r.points))}</span></div>` : ''}
        </div>`;
    }).join('') + (elapsed >= times.allShown && view.unpicked.length
        ? `<div class="unpicked">${esc(t.nobodyFellFor)} ${view.unpicked.map(r => `“${esc(r.text)}”`).join(', ')}</div>` : '');
    if (force || html !== revealDrawn) {
        revealDrawn = html;
        box.innerHTML = html;
    }
}

render();
