// An English page for families who sit down together every Friday night, for Shabbat dinner or simply
// Friday-night dinner, and look for something to play at the table once the meal winds down. They search
// for "shabbat dinner games", "games for the Shabbat table", "Friday night dinner games for families".
// Many are Jewish families abroad, and Israelis abroad, so the page says the game has Hebrew questions too.
// The Hebrew twin is /he/friday-dinner (seo/pages-he-occasions.js), the page for the same table in Israel.
//
// It stays respectful and inclusive: it says of Shabbat only that the table is a weekly gathering of the
// family. A family that keeps Shabbat without phones is not the audience, and the page says so in one line
// without arguing. Phones come out for the game only.
//
// Of the game, only what it does (November 2026): free, in the browser, no download, no account, up to 12
// phones a game, 5, 7 or 9 questions, three rounds where points grow, house lies, "Kids are playing" on the
// Create page, "Present Game" on the home page, REMATCH and the crew offer on the final screen, English and
// Hebrew questions. The Start button asks for no seasonal pack (pack=none): in late November and December
// an English game is otherwise offered Thanksgiving or Christmas questions, which don't belong at this
// table. Its own tag, seo-en-shabbat-dinner, so the groups it brings are counted apart.

const example = (q, story) => `<div class="example">
  <p class="q">${q}</p>
  <p>${story}</p>
</div>`;

const shabbatDinnerEn = `
<p>The candles are lit, dinner is over, and the whole family is still at the table. Bullshit is a game for that part of Friday night: everyone plays on their own phone, it's free, and there's nothing to download.</p>
<!--start-->
<p>It's the one night of the week everyone sits down together, grandparents, kids and the cousin who came for the weekend, and nobody is in a hurry to get up. There is nothing to set up: no box, no cards, no app and no account. One person starts a game, everyone else joins with a four-letter PIN, and in a minute the whole table is playing.</p>
<h2>What you play</h2>
<p>A strange true fact appears with a blank. Everyone quietly writes a made-up answer to fill it, one that sounds true enough to fool the rest of the table. Then all the answers appear together: everyone's lies, a few lies the game adds itself, and the truth. Each player picks the one they believe. You score for finding the truth, and for every relative who falls for your lie.</p>
${example('In 1807, a hunt ended with Napoleon retreating from hundreds of attacking ____',
    'Say Grandpa writes "geese", your daughter writes "squirrels" and your brother-in-law writes "wild boars". Half the table picks the boars, because they sound like something you\'d retreat from. The truth: rabbits. Whoever found it scores, and every point for "squirrels" goes to your daughter, who will bring it up again next Friday.')}
<h2>Why it fits a Friday-night table</h2>
<ul>
  <li><strong>Nobody needs to know trivia.</strong> Nobody knows these facts, so Grandma and the twelve-year-old start level. What wins is knowing each other: who believes what, and who can lie with a straight face.</li>
  <li><strong>It fits between courses.</strong> Pick 5, 7 or 9 questions. A game of 5 takes about ten minutes, so one game fits before dessert and another after.</li>
  <li><strong>Up to 12 phones a game.</strong> A big table plays in pairs, one phone between two. Kids who are slow to type play with a parent: there is a timer for each answer.</li>
  <li><strong>Questions in English and in Hebrew.</strong> Pick the language when you start. A table where some read Hebrew more easily than English, or the other way round, can play in either.</li>
  <li><strong>Young kids at the table?</strong> Tick "Kids are playing" when you start, and the game asks questions written for kids of 8 to 12 first.</li>
</ul>
<h2>Phones at the table, for the game only</h2>
<p>A phone at dinner usually means someone has left the conversation. Here it's the other way round: everyone looks up from their phone to watch who falls for what, and the arguing is out loud. The phones come out for the game, and go back in pockets when it ends. If your family keeps Shabbat without phones, this isn't a game for your Friday night, and that's as it should be. It works just as well around the table on a Saturday night or a Sunday afternoon.</p>
<h2>How to start</h2>
<ol>
  <li>Tap "Start a Shabbat game" on this page, choose English or Hebrew questions and how many, and tap "Create".</li>
  <li>The game shows a four-letter PIN. Everyone else opens bullshit.wtf on their phone, taps "Join Game" and types it. You can also send the invite link to the family chat.</li>
  <li>Everyone picks a nickname, and when the whole table is in, the host presses "Start".</li>
</ol>
<h2>For the host</h2>
<ul>
  <li><strong>A TV in the room?</strong> Open bullshit.wtf on a laptop connected to it, click "Present Game" and type the PIN. The questions, the answers and the scores show large, with music, and the phones are only for writing and picking.</li>
  <li><strong>One more?</strong> "Rematch" at the end starts a new game with the same players and new questions.</li>
  <li><strong>Make it a Friday habit.</strong> At the end, the game offers to save your family as a crew, with a scoreboard that adds up from game to game, so next week the title is on the line.</li>
  <li><strong>Family far away?</strong> Send them the invite link and they play from their own phone. See <a href="/video-call-party-game">a party game for a video call</a>.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. For a family evening on any night of the week, see <a href="/family-game-night">family game night</a>, and for the eight nights of candles, <a href="/hanukkah-party-game">a Hanukkah party game</a>.</p>
<p><small>A word on the name: "Bullshit" is on the screens, including the "biggest bullshitter" title at the end. At most tables that is half the fun. You know yours.</small></p>`;

module.exports = {
    pages: (en) => [
        {
            path: '/shabbat-dinner-game', twin: '/he/friday-dinner', site: en, tag: 'seo-en-shabbat-dinner',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start a Shabbat game' },
            image: '/assets/og-shabbat-dinner-en.png',
            title: 'A game for Shabbat dinner, on everyone\'s phone · Bullshit',
            description: 'A game for the Friday-night table, kids to grandparents: write a lie to a strange true fact, find the truth. Free, in the browser, no download, up to 12 players.',
            h1: 'A game for the Shabbat dinner table',
            body: shabbatDinnerEn,
        },
    ],
};
