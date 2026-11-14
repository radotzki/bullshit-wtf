// English holiday pages: Christmas, New Year's Eve and the office holiday party. One language only (no
// Hebrew twin: Israel has no such season to search for). Each carries its own tag on its Start button.
//
// Say only what the game really does (November 2026): free, in the phone's browser, up to 8 players a
// game, 5, 7 or 9 questions, three rounds where points grow, an optional big screen (Present), Rematch,
// saved crews. There is no Christmas or New Year question pack: the Start button turns the seasonal
// pack off (?pack=none), since from 1 to 13 December the Create page would otherwise switch the Hanukkah
// pack on for everyone. Each example is a real question of the game (functions/data/opening-questions.json).

const example = (q, story) => `<div class="example">
  <p class="q">${q}</p>
  <p>${story}</p>
</div>`;

const howToStart = (button) => `<h2>How to start</h2>
<ol>
  <li>Tap "${button}" on this page, choose English or Hebrew questions and 5, 7 or 9 questions, and tap "Create".</li>
  <li>The game shows a four-letter PIN and an invite link. Send the link to the family or the group chat, or everyone opens bullshit.wtf on their phone, taps "Join Game" and types the PIN.</li>
  <li>Everyone picks a nickname. When everyone is in, the person who opened the game taps "Start".</li>
</ol>`;

const christmas = `
<p>The presents are open, dinner is eaten, and nobody wants to move. Bullshit is a game for exactly that moment: everyone plays on their own phone, from the sofa, with nothing to unwrap, set up or tidy away. Grandparents, cousins and the teenager who came only for the food can all play the same game.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie to fill it. Then all the answers appear together, the lies and the truth, and everyone picks the one they believe. You score for finding the truth and for every relative who falls for your lie.</p>
${example('In Japan, millions of families eat ____ for Christmas dinner',
    'Say Grandma writes "sushi", your brother writes "turkey ramen" and you write "pizza". All of them sound like they could be true. The real answer: KFC. Whoever picked "turkey ramen" just gave your brother points.')}
<h2>Why it works at Christmas</h2>
<ul>
  <li><strong>Nobody needs to know trivia.</strong> Nobody knows these facts. The game is about writing a believable lie and knowing who in the family will fall for what.</li>
  <li><strong>Ages from about 10 up</strong> can play together: you need to write a short answer, that's all.</li>
  <li><strong>Up to 8 phones a game.</strong> A bigger family can play in pairs, one phone per pair.</li>
  <li><strong>The TV can join in.</strong> On a laptop or computer connected to the TV, open bullshit.wtf, click "Present" and type the PIN. The whole room sees the questions, the answers and the scores, with music, while phones are for writing and picking.</li>
  <li><strong>Free, no app, no sign-up.</strong> A cousin who arrives late joins with the PIN in seconds.</li>
  <li><strong>Short.</strong> A game of 5 questions takes about ten minutes. "Rematch" at the end starts another with the same players and new questions.</li>
</ul>
${howToStart('Start a Christmas game')}
<h2>A word on the name</h2>
<p>"Bullshit" is a swear word, and it is on the screens, including the "biggest bullshitter" title at the end. In most families that is half the fun. You know yours.</p>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Playing again on New Year's Eve? See <a href="/new-years-eve-party-game">the New Year's Eve page</a>.</p>`;

const newYear = `
<p>There are a few hours between dinner and midnight, and a room full of people waiting for the countdown. Bullshit fills them: a party game everyone plays on their own phone, in the browser, with nothing to buy or install. One person opens a game, the others type a four-letter PIN, and the room is playing in under a minute.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie that sounds true enough to fool the others. All the answers appear together with the truth, and everyone picks the one they believe. Find the truth and you score; fool a friend and you score for that too. Fall for one of the lies the game adds itself and you lose points.</p>
${example('The world\'s first webcam was set up to keep an eye on a ____',
    'Say Alex writes "baby", Priya writes "parking space" and Jo writes "fish tank". The truth: a coffee pot, in a university computer lab. Everyone who went for "fish tank" just gave Jo points.')}
<h2>Why it suits New Year's Eve</h2>
<ul>
  <li><strong>It fits around the party.</strong> A game of 5 questions takes about ten minutes, so you can play one, go back to the drinks, and play another before midnight. "Rematch" keeps the same players and brings new questions.</li>
  <li><strong>Points grow each round</strong>, so nobody is out of it until the last question, and the "final question" card says how far first place leads.</li>
  <li><strong>Up to 8 phones a game.</strong> A bigger party plays in pairs, one phone per pair, or opens a second game in the kitchen.</li>
  <li><strong>The big screen.</strong> On a laptop or computer connected to the TV, open bullshit.wtf, click "Present" and type the PIN, and everyone else can watch, read the lies and shout bad advice.</li>
  <li><strong>Free and in the browser.</strong> No app, no sign-up, no ads in the game.</li>
</ul>
${howToStart('Start a New Year\'s game')}
<h2>Keep the crew for next year</h2>
<p>At the end of a game you can save the group as a crew. The crew gets its own page, with standings that carry over from game to game and a button for a rematch, so the friend who won tonight can be dethroned at the next party.</p>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Family first? See <a href="/christmas-party-game">the Christmas page</a>.</p>`;

const office = `
<p>The office holiday party needs one thing that gets people from different teams talking, without a speech or a quiz master. Bullshit is a party game everyone plays on their own phone: a strange true fact appears with a blank, everyone writes a lie to fill it, and then everyone tries to find the truth among all the lies. It is free, it runs in the browser, and nobody has to sign up for anything.</p>
<!--start-->
${example('The first thing ever sold on eBay was a broken ____',
    'Say someone from finance writes "printer", the CEO writes "Game Boy" and the new intern writes "lava lamp". The truth: a laser pointer. Whoever picked "Game Boy" just gave the CEO points, and that is a story for the rest of the party.')}
<h2>Why it works at a work party</h2>
<ul>
  <li><strong>Everyone starts equal.</strong> Nobody knows these facts, so the new hire and the person who has been here ten years start from the same place. What wins is knowing how your colleagues think.</li>
  <li><strong>Everyone plays at once.</strong> Nobody waits for a turn, and the quiet ones play exactly as much as the loud ones.</li>
  <li><strong>It fits a slot.</strong> A game of 5 questions takes about ten minutes; two or three games fill half an hour.</li>
  <li><strong>The screen in the room.</strong> Open bullshit.wtf on the computer connected to the screen, click "Present" and type the PIN. The room sees the questions, every answer, who picked what and the scores.</li>
  <li><strong>Remote colleagues can play.</strong> On a video call, everyone joins with the PIN from wherever they are, and whoever shares their screen shows the big-screen view.</li>
</ul>
<h2>More than 8 people</h2>
<p>A game takes 8 phones at most. For a bigger party, play in teams of two to four on one phone, up to 8 teams in one game on one screen, or let each table open its own game and play a final between the winners. The <a href="/team-building-game">team game page</a> has the details: how to put it on the big screen, how to split a room of up to 30, and which settings fit 15 minutes.</p>
<h2>Before the party</h2>
<ul>
  <li><strong>Try it once yourself.</strong> Open a game, and in the empty lobby tap "Try 5 quick questions alone" to see five of the game's questions.</li>
  <li><strong>The name.</strong> "Bullshit" is a swear word, and it is on the screens. In most teams that is the joke; you know yours.</li>
  <li><strong>The lies go up as typed.</strong> The game swaps rude nicknames for a harmless one, but it does not touch the lies. Ask people to keep it work-safe before the first question.</li>
</ul>
${howToStart('Start an office party game')}
<p>The full rules and points are on <a href="/how-to-play">How to play</a>.</p>`;

module.exports = {
    pages: (en) => [
        {
            path: '/christmas-party-game', site: en, tag: 'seo-en-christmas',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start a Christmas game' },
            image: '/assets/og-christmas-en.png',
            title: 'A Christmas party game for the whole family, free on your phones',
            description: 'After presents and dinner: Bullshit is a free bluffing trivia game everyone plays on their own phone. Write a lie, find the truth, fool the family. No app, up to 8 players.',
            h1: 'A Christmas game for after dinner',
            body: christmas,
        },
        {
            path: '/new-years-eve-party-game', site: en, tag: 'seo-en-new-year',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start a New Year\'s game' },
            image: '/assets/og-new-year-en.png',
            title: 'A New Year\'s Eve party game: free bluffing trivia on your phones',
            description: 'Something to play before midnight: Bullshit is a free party game where everyone writes a lie and tries to find the truth, on their own phone. No app, 10-minute games.',
            h1: 'A New Year\'s Eve game for the hours before midnight',
            body: newYear,
        },
        {
            path: '/office-holiday-party-game', site: en, tag: 'seo-en-office-party',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start an office party game' },
            image: '/assets/og-office-party-en.png',
            title: 'An office holiday party game on phones and the big screen: free, no sign-up',
            description: 'A game for the work holiday party: everyone writes a lie, everyone hunts for the truth, on their own phone and the room\'s screen. Free, in the browser, teams for big groups.',
            h1: 'A game for the office holiday party',
            body: office,
        },
    ],
};
