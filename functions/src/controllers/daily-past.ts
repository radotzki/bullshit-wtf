/**
 * Past days of the daily puzzle, a page each, for search: /daily/2026-11-18 and /he/daily/2026-11-18,
 * a list of them at /daily/past and /he/daily/past, and their sitemap at /sitemap-daily.xml.
 * Served by the dailyPast function (index.ts) through Hosting rewrites (firebase.json).
 *
 * Why a function and not files written at build time, like the search pages: a page a day has to
 * appear every day, deploy or not, and a file in game/dist is public the moment it deploys. Built at
 * deploy time, the list would stop at the deploy's day; built ahead, tomorrow's answer would be on
 * the site. Here each request asks the clock, so a day shows up on its own, and never early. The
 * HTML is whole on arrival (question, answers, the answer in a details block): a search engine reads
 * it without running a script, as it reads the search pages.
 *
 * When a day is public: once it has ended in Israel (the puzzle's clock: /daily moves to the next
 * question at Israel's midnight) and in every US time zone (Honolulu is the last, UTC-10 all year).
 * So the day before yesterday and earlier always are; yesterday is from 10:00 UTC (12:00 or 13:00
 * in Israel); today and later never. Only a day with a question of its own gets a page (a repeat
 * day, see daily.questionFor, has none).
 *
 * Pure: no Firebase, no clock of its own, no database. Nothing here reads or writes the database.
 */
import { DailyBank, DailyLang, DailyQuestion, addDays, daysBetween, isDay, israelDay } from './daily';
import { MAX_PLAYERS } from '../game-model';

export const SITE = 'https://bullshit.wtf';
/** The ?via= tag on this page's links into the game, one per kind of page (only ?via= reaches the game). */
export const VIA_DAY = 'daily-past';
export const VIA_LIST = 'daily-past-list';

const DAY_MS = 24 * 3600 * 1000;
/** Honolulu keeps UTC-10 all year (Hawaii has no summer time): the last US day to end. */
const US_LAST_OFFSET_MS = -10 * 3600 * 1000;

// ---------- which days are public ----------

/** The date in Honolulu at `now`: YYYY-MM-DD. */
export function usLastDay(now: number): string {
    return new Date(now + US_LAST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The newest day with a public page at `now`: the day before the earlier of Israel's and Honolulu's dates. */
export function lastPublicDay(now: number): string {
    const il = israelDay(now);
    const us = usLastDay(now);
    return addDays(il < us ? il : us, -1);
}

/** The moment (epoch ms) the next day turns public: Honolulu's next midnight. */
export function nextPublicAt(now: number): number {
    const local = now + US_LAST_OFFSET_MS;
    return (Math.floor(local / DAY_MS) + 1) * DAY_MS - US_LAST_OFFSET_MS;
}

/** A language's days with a question of their own that are public at `now`, oldest first. */
export function publicQuestions(list: DailyQuestion[], now: number): DailyQuestion[] {
    const last = lastPublicDay(now);
    return (list || []).filter(q => q.day <= last);
}

/** The puzzle's number of a day (1 on the language's first day, as /daily counts). */
export function numberOf(list: DailyQuestion[], day: string): number {
    return daysBetween(list[0].day, day) + 1;
}

// ---------- addresses ----------

export function dayPath(lang: DailyLang, day: string): string {
    return (lang === 'he' ? '/he' : '') + '/daily/' + day;
}

export function listPath(lang: DailyLang): string {
    return (lang === 'he' ? '/he' : '') + '/daily/past';
}

export const SITEMAP_PATH = '/sitemap-daily.xml';

export type Route = { kind: 'day', lang: DailyLang, day: string } | { kind: 'list', lang: DailyLang } | { kind: 'sitemap' };

/** What an address asks for, or null for anything this function doesn't serve. */
export function route(path: any): Route | null {
    if (typeof path !== 'string') {
        return null;
    }
    const p = path.split('?')[0].split('#')[0].replace(/\/+$/, '');
    if (p === SITEMAP_PATH) {
        return { kind: 'sitemap' };
    }
    const m = /^(\/he)?\/daily\/(past|\d{4}-\d{2}-\d{2})$/.exec(p);
    if (!m) {
        return null;
    }
    const lang: DailyLang = m[1] ? 'he' : 'en';
    if (m[2] === 'past') {
        return { kind: 'list', lang };
    }
    return isDay(m[2]) ? { kind: 'day', lang, day: m[2] } : null;
}

// ---------- words ----------

const WORDS = {
    en: {
        lang: 'en', dir: 'ltr', logo: 'Bullshit', home: '/', other: 'בעברית', locale: 'en-US', ogLocale: 'en_US',
        kicker: 'BULLSHIT DAILY #{no} · {date}',
        instruction: 'One answer is true. The rest are lies. Spot the truth.',
        headTruth: 'YOU SPOTTED THE TRUTH',
        headLie: 'BULLSHIT! YOU FELL FOR A LIE',
        reveal: 'The answer',
        truth: 'The truth: {answer}',
        lies: 'The lies: {lies}',
        source: 'Really? Here\'s the source',
        labelTruth: 'THE TRUTH',
        labelLie: 'A LIE',
        labelPick: 'YOUR PICK',
        prev: 'Day before',
        next: 'Day after',
        list: 'All past puzzles',
        today: 'Try today\'s question',
        gameTitle: 'Play this with friends',
        gameText: 'With friends in one room, everyone writes a lie, and you score each time someone falls for yours.',
        gameStart: 'START A GAME WITH FRIENDS',
        gameHint: 'Free. 2 to {max} players, each on their own phone.',
        title: '{q} · Bullshit daily #{no}',
        description: 'Which is true: {options}? Pick one, then see the answer, the lies and the source. Bullshit\'s daily puzzle for {date}.',
        or: ' or ',
        listTitle: 'Past Bullshit daily puzzles: strange facts, one truth, three lies',
        listHead: 'Past daily puzzles',
        listDescription: 'Every past question of Bullshit\'s daily puzzle: a strange fact, one true answer and the lies around it. Pick, then see the truth and its source.',
        listIntro: 'One strange fact a day, one true answer, the rest lies. Pick one and see the truth.',
        listEmpty: 'The first one shows up here the day after it is played.',
        missingTitle: 'No puzzle here',
        missing: 'There is no past puzzle for that day, or it hasn\'t ended yet.',
        blank: '_____',
    },
    he: {
        lang: 'he', dir: 'rtl', logo: 'בולשיט', home: '/he', other: 'English', locale: 'he-IL', ogLocale: 'he_IL',
        kicker: 'הבולשיט היומי #{no} · {date}',
        instruction: 'רק תשובה אחת נכונה. כל השאר שקרים. מצאו את האמת.',
        headTruth: 'מצאת את האמת',
        headLie: 'בולשיט! נפלת בשקר',
        reveal: 'התשובה',
        truth: 'האמת: {answer}',
        lies: 'השקרים: {lies}',
        source: 'באמת? הנה המקור',
        labelTruth: 'האמת',
        labelLie: 'שקר',
        labelPick: 'הבחירה שלך',
        prev: 'היום הקודם',
        next: 'היום שאחרי',
        list: 'כל השאלות הקודמות',
        today: 'נסו את השאלה של היום',
        gameTitle: 'לשחק את זה עם חברים',
        gameText: 'כשיושבים יחד, כל אחד כותב שקר ומקבלים נקודות על כל מי שנופל בו.',
        gameStart: 'פותחים משחק עם חברים',
        gameHint: 'בחינם. 2 עד {max} שחקנים, כל אחד בטלפון שלו.',
        title: '{q} · הבולשיט היומי #{no}',
        description: 'מה נכון: {options}? בוחרים תשובה ורואים את האמת, השקרים והמקור. הבולשיט היומי של {date}.',
        or: ' או ',
        listTitle: 'שאלות קודמות של הבולשיט היומי: עובדות מוזרות, אמת אחת ושקרים',
        listHead: 'השאלות היומיות הקודמות',
        listDescription: 'כל השאלות הקודמות של הבולשיט היומי: עובדה מוזרה, תשובה נכונה אחת והשקרים סביבה. בוחרים, ואז רואים את האמת ואת המקור.',
        listIntro: 'כל יום עובדה מוזרה אחת, תשובה נכונה אחת, וכל השאר שקרים. בוחרים ורואים מה האמת.',
        listEmpty: 'השאלה הראשונה תופיע כאן יום אחרי שישחקו בה.',
        missingTitle: 'אין כאן שאלה',
        missing: 'אין שאלה קודמת ליום הזה, או שהיום הזה עוד לא נגמר.',
        blank: '_____',
    },
};
export type PastWords = typeof WORDS.en;
export const words = (lang: DailyLang): PastWords => WORDS[lang === 'he' ? 'he' : 'en'];

const fill = (s: string, v: { [k: string]: string | number }) => s.replace(/\{(\w+)\}/g, (m, k) => k in v ? String(v[k]) : m);
const esc = (s: any) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const json = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** A day as people write it: "November 18, 2026", "18 בנובמבר 2026". */
export function dateText(lang: DailyLang, day: string): string {
    return new Intl.DateTimeFormat(words(lang).locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(day + 'T12:00:00Z'));
}

/** The sentence with a blank where the answer goes, as plain text. */
export function blanked(q: DailyQuestion): string {
    return q.questionText.replace('$blank$', words(q.lang).blank);
}

/** The sentence with its answer in place of the blank. */
export function filledText(q: DailyQuestion): string {
    return q.questionText.replace('$blank$', q.realAnswer);
}

/** Cut at a word, for a title: at most `max` characters, with an ellipsis when cut. */
export function cut(s: string, max: number): string {
    if (s.length <= max) {
        return s;
    }
    const at = s.lastIndexOf(' ', max - 1);
    return s.slice(0, at > max / 2 ? at : max - 1).replace(/[\s,;:.-]+$/, '') + '…';
}

/**
 * The answers in the page's order: the truth and every lie, mixed by the question's id, so the order
 * is the same on every load and in every cache, and the truth is not always first. k: 0 is the truth.
 */
export function answerOrder(q: DailyQuestion): { k: number, t: string }[] {
    const all = [q.realAnswer].concat(q.fakeAnswers).map((t, k) => ({ k, t }));
    let h = 2166136261;
    for (let i = 0; i < q.id.length; i++) {
        h = Math.imul(h ^ q.id.charCodeAt(i), 16777619) >>> 0;
    }
    for (let i = all.length - 1; i > 0; i--) {
        h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
        const j = h % (i + 1);
        const t = all[i]; all[i] = all[j]; all[j] = t;
    }
    return all;
}

// ---------- the pages ----------

/** Scripts every plain page of the site carries in <head>: the arrival note and the visit beacon. */
export interface PageScripts { arrival: string, beacon: string }

export interface Answer {
    status: number;
    type: string;
    body: string;
    /** Seconds Hosting's cache may keep it. */
    cache: number;
    noindex: boolean;
}

/** How long a cache may keep an answer: until the next day turns public, at most an hour, at least a minute. */
export function cacheSeconds(now: number): number {
    return Math.max(60, Math.min(3600, Math.floor((nextPublicAt(now) - now) / 1000)));
}

function head(lang: DailyLang, o: { title: string, description: string, path: string, twin: string, ld: any, scripts: PageScripts, noindex?: boolean, type?: string }): string {
    const w = words(lang);
    const en = lang === 'en' ? o.path : o.twin;
    const he = lang === 'he' ? o.path : o.twin;
    const brand = lang === 'he' ? '"Suez One", serif' : '"Luckiest Guy", cursive';
    return `<!doctype html>
<html lang="${w.lang}" dir="${w.dir}" data-page="plain">
<head>
  <meta charset="utf-8">
  ${o.scripts.beacon}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.description)}">
${o.noindex ? '  <meta name="robots" content="noindex">' : `  <link rel="canonical" href="${SITE}${o.path}">
  <link rel="alternate" hreflang="en" href="${SITE}${en}">
  <link rel="alternate" hreflang="he" href="${SITE}${he}">
  <link rel="alternate" hreflang="x-default" href="${SITE}${en}">`}
  <meta property="og:type" content="${o.type || 'website'}">
  <meta property="og:site_name" content="Bullshit">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.description)}">
  <meta property="og:url" content="${SITE}${o.path}">
  <meta property="og:image" content="${SITE}/assets/og-daily-${lang}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${w.ogLocale}">
  <meta name="twitter:card" content="summary_large_image">
  ${o.scripts.arrival}
  <link rel="icon" type="image/png" href="/assets/favicon-32x32.png" sizes="32x32">
  <link href="https://fonts.googleapis.com/css?family=Luckiest+Guy|Suez+One" rel="stylesheet">
  ${o.ld ? `<script type="application/ld+json">${json(o.ld)}</script>` : ''}
  <style>
    :root { --brand: #db7151; --gold: #f3d467; --wine: #97374e; --ink: #2b2523; --paper: #fffaf3; --line: #e6d9cc; --good: #2f8f5b; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: var(--wine); color: #fff; padding: 12px 16px; }
    header .top { max-width: 520px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .logo { font-family: ${brand}; font-size: 26px; color: var(--gold); text-decoration: none; letter-spacing: 1px; }
    header a.lang { color: #fff; font-size: 15px; }
    main { max-width: 520px; margin: 0 auto; padding: 4px 16px 40px; }
    .kicker { font: 700 14px/1.3 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; letter-spacing: ${lang === 'he' ? '0' : '1.5px'}; color: var(--wine); margin: 18px 0 4px; }
    .how { margin: 4px 0 0; color: #5d524c; font-size: 16px; }
    h1.q { font-family: ${lang === 'he' ? '"Suez One", serif' : 'inherit'}; font-size: 24px; line-height: 1.3; font-weight: ${lang === 'he' ? 'normal' : '700'}; margin: 14px 0 16px; overflow-wrap: anywhere; }
    h1.list { font-family: ${brand}; font-weight: normal; color: var(--wine); font-size: 30px; line-height: 1.15; margin: 18px 0 6px; text-transform: uppercase; }
    h1.q .stuck { white-space: nowrap; }
    h1.q .blank { color: var(--brand); letter-spacing: -1px; white-space: nowrap; }
    .answers { display: grid; gap: 10px; }
    .answer { position: relative; display: block; width: 100%; padding: 14px 16px; border: 2px solid var(--wine); border-radius: 10px; background: #fff; color: var(--ink); font-family: inherit; font-weight: 600; font-size: 18px; line-height: 1.3; text-align: center; cursor: pointer; text-transform: uppercase; overflow-wrap: anywhere; }
    .answer:hover:not(:disabled), .answer:focus-visible { background: #fbeee6; outline: none; }
    .answer:disabled { cursor: default; border-color: var(--line); color: #6b5f59; }
    .answer.truth { border-color: var(--good); background: #d8f0e2; color: var(--ink); }
    .answer.mine { box-shadow: 0 0 0 3px var(--gold); }
    .answer .tag { display: block; font-size: 11px; font-weight: 700; letter-spacing: ${lang === 'he' ? '0' : '.6px'}; color: #7a5a4a; }
    .answer.truth .tag { color: var(--good); }
    h2.head { font-family: ${brand}; font-weight: normal; font-size: 28px; line-height: 1.15; margin: 18px 0 4px; text-transform: uppercase; color: var(--wine); overflow-wrap: anywhere; }
    h2.head.won { color: var(--good); }
    details.answer-box { margin: 16px 0 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    details.answer-box summary { cursor: pointer; font-weight: 700; color: var(--wine); }
    details.answer-box p { margin: 8px 0 0; overflow-wrap: anywhere; }
    a { color: var(--wine); }
    .card { margin: 22px 0 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
    .card h2 { color: var(--wine); font-size: 21px; line-height: 1.25; margin: 0 0 6px; }
    .card p { margin: 0 0 10px; }
    .btn { display: block; width: 100%; padding: 13px 18px; border-radius: 8px; border: 0; text-decoration: none; text-align: center; font-family: inherit; font-weight: 700; font-size: 17px; line-height: 1.25; background: var(--brand); color: #fff; }
    .hint { margin: 8px 0 0 !important; text-align: center; font-size: 14px; color: #6b5f59; }
    nav.days { display: flex; justify-content: space-between; gap: 12px; margin: 22px 0 0; font-size: 16px; }
    nav.more { margin: 14px 0 0; text-align: center; font-size: 15px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; }
    ol.past { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 10px; }
    ol.past a { display: block; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); text-decoration: none; overflow-wrap: anywhere; }
    ol.past a:hover, ol.past a:focus-visible { border-color: var(--wine); }
    ol.past .when { display: block; font-size: 13px; font-weight: 700; color: var(--wine); }
  </style>
</head>
<body>
  <header>
    <div class="top">
      <a class="logo" href="${w.home}">${esc(w.logo)}</a>
      <a class="lang" href="${o.twin}" hreflang="${lang === 'he' ? 'en' : 'he'}" lang="${lang === 'he' ? 'en' : 'he'}">${esc(w.other)}</a>
    </div>
  </header>
`;
}

function gameCard(lang: DailyLang, via: string): string {
    const w = words(lang);
    return `    <section class="card">
      <h2>${esc(w.gameTitle)}</h2>
      <p>${esc(w.gameText)}</p>
      <a class="btn" id="p-start" href="/create-game?lang=${lang}&amp;via=${via}">${esc(w.gameStart)}</a>
      <p class="hint">${esc(fill(w.gameHint, { max: MAX_PLAYERS }))}</p>
    </section>
`;
}

/** The page script: a pick marks the truth and the lies, and opens the answer. Plain ES5, no storage. */
function pickScript(lang: DailyLang): string {
    const w = words(lang);
    const say = { truth: w.headTruth, lie: w.headLie, labelTruth: w.labelTruth, labelLie: w.labelLie, labelPick: w.labelPick };
    return `<script>
    (function () {
      var s = ${json(say)}, d = document, box = d.getElementById('p-answers');
      if (!box) return;
      var buttons = box.getElementsByTagName('button');
      function tag(b, text) { var t = d.createElement('span'); t.className = 'tag'; t.textContent = text; b.appendChild(t); }
      box.addEventListener('click', function (e) {
        var b = e.target;
        while (b && b !== box && b.tagName !== 'BUTTON') b = b.parentNode;
        if (!b || b === box || b.disabled) return;
        var won = b.getAttribute('data-k') === '0';
        for (var i = 0; i < buttons.length; i++) {
          var x = buttons[i], truth = x.getAttribute('data-k') === '0';
          x.disabled = true;
          if (truth) x.className += ' truth';
          tag(x, x === b ? s.labelPick + ' · ' + (truth ? s.labelTruth : s.labelLie) : truth ? s.labelTruth : s.labelLie);
        }
        b.className += ' mine';
        var h = d.getElementById('p-head');
        h.textContent = won ? s.truth : s.lie;
        if (won) h.className += ' won';
        h.hidden = false;
        var a = d.getElementById('p-answer');
        a.open = true;
        h.scrollIntoView && h.scrollIntoView({ block: 'nearest' });
      });
    })();
  </script>`;
}

/** One past day's page, or null when that day has no public page (unknown, a repeat, today or later). */
export function dayPage(bank: DailyBank, lang: DailyLang, day: string, now: number, scripts: PageScripts): string | null {
    const list = bank[lang] || [];
    const shown = publicQuestions(list, now);
    const at = shown.findIndex(q => q.day === day);
    if (at < 0) {
        return null;
    }
    const q = shown[at];
    const w = words(lang);
    const other: DailyLang = lang === 'he' ? 'en' : 'he';
    const twinShown = publicQuestions(bank[other] || [], now).some(t => t.day === day);
    const path = dayPath(lang, day);
    // The same day in the other language (its own question), else that language's list.
    const twin = twinShown ? dayPath(other, day) : listPath(other);
    const no = numberOf(list, day);
    const date = dateText(lang, day);
    const order = answerOrder(q);
    const texts = order.map(a => a.t);
    const options = texts.slice(0, -1).join(', ') + w.or + texts[texts.length - 1];
    const title = fill(w.title, { q: cut(blanked(q), 70), no });
    const description = fill(w.description, { options, date });
    const prev = at > 0 && shown[at - 1].day === addDays(day, -1) ? shown[at - 1] : null;
    const next = at < shown.length - 1 && shown[at + 1].day === addDays(day, 1) ? shown[at + 1] : null;
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        inLanguage: lang,
        url: SITE + path,
        datePublished: day,
        isPartOf: { '@type': 'CollectionPage', name: w.listHead, url: SITE + listPath(lang) },
    };
    const parts = q.questionText.split('$blank$');
    // A letter glued to the blank (Hebrew "ב___") stays on its line.
    const stuck = /\S*$/.exec(parts[0])[0];
    const lead = parts[0].slice(0, parts[0].length - stuck.length);
    const lies = q.fakeAnswers.join(', ');
    return head(lang, { title, description, path, twin, ld, scripts, type: 'article' }) + `  <main>
    <p class="kicker">${esc(fill(w.kicker, { no, date }))}</p>
    <p class="how">${esc(w.instruction)}</p>
    <h1 class="q">${esc(lead)}<span class="stuck">${esc(stuck)}<span class="blank">${esc(w.blank)}</span></span>${esc(parts.slice(1).join(''))}</h1>
    <div class="answers" id="p-answers">
${order.map(a => `      <button type="button" class="answer" data-k="${a.k}">${esc(a.t)}</button>`).join('\n')}
    </div>
    <h2 class="head" id="p-head" hidden></h2>
    <details class="answer-box" id="p-answer">
      <summary>${esc(w.reveal)}</summary>
      <p><strong>${esc(filledText(q))}</strong></p>
      <p>${esc(fill(w.truth, { answer: q.realAnswer }))}</p>
      <p>${esc(fill(w.lies, { lies }))}</p>
${q.citation ? `      <p><a href="${esc(q.citation)}" rel="noopener nofollow" target="_blank">${esc(w.source)}</a></p>\n` : ''}    </details>
${gameCard(lang, VIA_DAY)}    <nav class="days">
      <span>${prev ? `<a href="${dayPath(lang, prev.day)}" rel="prev">${esc(w.prev)}</a>` : ''}</span>
      <span>${next ? `<a href="${dayPath(lang, next.day)}" rel="next">${esc(w.next)}</a>` : ''}</span>
    </nav>
    <nav class="more">
      <a href="${listPath(lang)}">${esc(w.list)}</a>
      <a href="${lang === 'he' ? '/he' : ''}/daily?via=${VIA_DAY}">${esc(w.today)}</a>
    </nav>
  </main>
  ${pickScript(lang)}
</body>
</html>
`;
}

/** The list of a language's public days, newest first. */
export function listPage(bank: DailyBank, lang: DailyLang, now: number, scripts: PageScripts): string {
    const list = bank[lang] || [];
    const shown = publicQuestions(list, now).slice().reverse();
    const w = words(lang);
    const other: DailyLang = lang === 'he' ? 'en' : 'he';
    const path = listPath(lang);
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: w.listTitle,
        description: w.listDescription,
        inLanguage: lang,
        url: SITE + path,
    };
    return head(lang, { title: w.listTitle, description: w.listDescription, path, twin: listPath(other), ld, scripts }) + `  <main>
    <h1 class="list">${esc(w.listHead)}</h1>
    <p class="how">${esc(w.listIntro)}</p>
${shown.length ? `    <ol class="past">
${shown.map(q => `      <li><a href="${dayPath(lang, q.day)}"><span class="when">#${numberOf(list, q.day)} · ${esc(dateText(lang, q.day))}</span>${esc(blanked(q))}</a></li>`).join('\n')}
    </ol>
` : `    <p>${esc(w.listEmpty)}</p>
`}    <nav class="more">
      <a href="${lang === 'he' ? '/he' : ''}/daily?via=${VIA_DAY}">${esc(w.today)}</a>
    </nav>
${gameCard(lang, VIA_LIST)}  </main>
</body>
</html>
`;
}

/** The page for an address with no past puzzle: not indexed, with a way on. */
export function missingPage(lang: DailyLang, scripts: PageScripts): string {
    const w = words(lang);
    const other: DailyLang = lang === 'he' ? 'en' : 'he';
    return head(lang, { title: w.missingTitle, description: w.missing, path: listPath(lang), twin: listPath(other), ld: null, scripts, noindex: true }) + `  <main>
    <h1 class="list">${esc(w.missingTitle)}</h1>
    <p class="how">${esc(w.missing)}</p>
    <nav class="more">
      <a href="${listPath(lang)}">${esc(w.list)}</a>
      <a href="${lang === 'he' ? '/he' : ''}/daily?via=${VIA_DAY}">${esc(w.today)}</a>
    </nav>
  </main>
</body>
</html>
`;
}

/** The sitemap of both lists and every public day, each with its twin in the other language. */
export function sitemap(bank: DailyBank, now: number): string {
    const entry = (loc: string, en: string | null, he: string | null) => `  <url>
    <loc>${SITE}${loc}</loc>
${en ? `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/>\n` : ''}${he ? `    <xhtml:link rel="alternate" hreflang="he" href="${SITE}${he}"/>\n` : ''}  </url>`;
    const urls = [entry(listPath('en'), listPath('en'), listPath('he')), entry(listPath('he'), listPath('en'), listPath('he'))];
    const en = publicQuestions(bank.en, now).map(q => q.day);
    const he = publicQuestions(bank.he, now).map(q => q.day);
    en.forEach(day => urls.push(entry(dayPath('en', day), dayPath('en', day), he.indexOf(day) >= 0 ? dayPath('he', day) : null)));
    he.forEach(day => urls.push(entry(dayPath('he', day), en.indexOf(day) >= 0 ? dayPath('en', day) : null, dayPath('he', day))));
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

/** The answer to a GET of `path` at `now`: a page, the sitemap, or a 404 page. */
export function answer(bank: DailyBank, path: any, now: number, scripts: PageScripts): Answer {
    const r = route(path);
    const cache = cacheSeconds(now);
    const html = 'text/html; charset=utf-8';
    if (r && r.kind === 'sitemap') {
        return { status: 200, type: 'application/xml; charset=utf-8', body: sitemap(bank, now), cache, noindex: false };
    }
    if (r && r.kind === 'list') {
        return { status: 200, type: html, body: listPage(bank, r.lang, now, scripts), cache, noindex: false };
    }
    if (r && r.kind === 'day') {
        const page = dayPage(bank, r.lang, r.day, now, scripts);
        if (page) {
            return { status: 200, type: html, body: page, cache, noindex: false };
        }
    }
    const lang: DailyLang = typeof path === 'string' && /^\/he(\/|$)/.test(path) ? 'he' : 'en';
    return { status: 404, type: html, body: missingPage(lang, scripts), cache, noindex: true };
}
