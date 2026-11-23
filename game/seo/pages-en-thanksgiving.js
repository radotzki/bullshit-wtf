// The Thanksgiving page, for "Thanksgiving party game" and "Thanksgiving game for family on TV", and
// the Friendsgiving page, for "Friendsgiving games" (grown-up friends hosting the dinner, the weekends
// around Thanksgiving). Each page has its own ?via= tag, so the games each one brings are counted apart.
// English only (no Hebrew twin: the holiday is American, and its question pack is in English).
// Its Start button opens Create with the Thanksgiving pack (?pack=thanksgiving), which works on any
// day; from 20 to 30 November every English game is offered the pack anyway (questionPacks in
// game-model.ts).
//
// Say only what the game really does (November 2026): free, in the phone's browser, up to 12 players a
// game, 5, 7 or 9 questions, three rounds where points grow, an optional big screen (Present), Rematch.
// A game of the pack has up to 3 Thanksgiving questions among the usual ones. The example and the
// facts named below are questions of the pack (functions/data/thanksgiving-questions.json); a test
// (test/thanksgiving-page.test.js, test/friendsgiving-page.test.js) fails if one of them leaves the file.

const thanksgiving = `
<p>The turkey is eaten, the dishes can wait, and three generations are in one room with the TV on. Bullshit is a game for exactly that hour: a strange true fact appears with a blank, everyone writes a lie to fill it on their own phone, and then the whole family tries to find the truth among the lies. It is free, it runs in the browser, and there is nothing to buy, install or set up.</p>
<!--start-->
<h2>Thanksgiving questions, already in the game</h2>
<p>A game started from this page has Thanksgiving questions mixed in with the usual strange facts: the turkey, the parade, the football, the Pilgrims and the leftovers. What a president said when he spared his turkey. What the first Macy's parade had instead of balloons. What a football announcer handed the best player of the game. Every truth was checked against a source, and nobody at the table will know it.</p>
<div class="example">
  <p class="q">Big Bird's yellow costume on "Sesame Street" is made with the tail feathers of ____</p>
  <p>Say Grandpa writes "canaries", your sister writes "ostriches" and the eight-year-old writes "a giant chicken". The truth: turkeys. Everyone who picked "ostriches" just gave your sister points, and she will mention it until Christmas.</p>
</div>
<h2>Put it on the TV</h2>
<p>The game is made for one room and one screen. On a laptop or computer connected to the TV, open bullshit.wtf, click "Present" and type the game's PIN. The TV shows the questions, every answer, who fell for what and the scores, with music. Phones are only for writing and picking, so the people on the sofa and the people still at the table play the same game.</p>
<h2>Why it works on Thanksgiving</h2>
<ul>
  <li><strong>Nobody needs to know trivia.</strong> Nobody knows these facts. The game is about writing a believable lie and knowing which uncle will fall for it.</li>
  <li><strong>Ages from about 10 up</strong> can play together: you need to write a short answer, that's all.</li>
  <li><strong>Up to 12 phones a game.</strong> A bigger family plays in pairs, one phone per pair, which is also the easy way to include the youngest and the oldest.</li>
  <li><strong>Short.</strong> A game of 5 questions takes about ten minutes, so it fits between dinner and pie, or at halftime. "Rematch" at the end starts another with the same players and new questions.</li>
  <li><strong>Free, no app, no sign-up.</strong> A cousin who arrives late joins with the PIN in seconds.</li>
</ul>
<h2>How to start</h2>
<ol>
  <li>Tap "Start a Thanksgiving game" on this page. "Thanksgiving questions" is already ticked. Choose 5, 7 or 9 questions and tap "Create".</li>
  <li>The game shows a four-letter PIN and an invite link. Send the link to the family chat, or everyone opens bullshit.wtf on their phone, taps "Join Game" and types the PIN.</li>
  <li>Everyone picks a nickname. When everyone is in, the person who opened the game taps "Start".</li>
</ol>
<h2>Friendsgiving, and the long weekend</h2>
<p>From the Friday before Thanksgiving to the Sunday after, every English game is offered the Thanksgiving questions, so the same game works for Friendsgiving, for Thursday and for the leftovers on Saturday. A game takes up to three of them, and the pack has enough for ten games without a repeat. Hosting friends rather than family? See <a href="/friendsgiving-games">the Friendsgiving page</a>.</p>
<h2>A word on the name</h2>
<p>"Bullshit" is a swear word, and it is on the screens, including the "biggest bullshitter" title at the end. In most families that is half the fun. You know yours.</p>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Family coming back in December? See <a href="/christmas-party-game">the Christmas page</a>.</p>`;

const friendsgiving = `
<p>Everyone brought a dish, nobody brought a game. Bullshit is for the hour after the pie: a strange true fact appears with a blank, everyone writes a lie on their own phone, and the table hunts for the truth. Free, in the browser, nothing to install.</p>
<!--start-->
<h2>How it plays at the table</h2>
<p>Nobody moves the plates. Each guest plays on their own phone, so the people at the far end of the table are in the same game as the host. Every question is a true fact with its best part missing. Everyone writes something that sounds right, then all the answers appear together: the guests' lies, a few lies from the game itself, and the truth. Everyone picks what they believe. Find the truth and you score; every friend who falls for your lie scores for you too; fall for one of the game's own lies and you lose points. Points grow each round, so nobody is out of it until the last question.</p>
<h2>Thanksgiving questions, on the menu</h2>
<p>A game started from this page mixes up to three Thanksgiving questions in with the usual strange facts: the year a president moved the holiday, the company kitchen that invented green bean casserole, the sitcom that dropped live turkeys from the sky, the old name for the wishbone. Every truth was checked against a source, and nobody at the table will know it.</p>
<div class="example">
  <p class="q">In 1939 President Roosevelt moved Thanksgiving a week earlier, and annoyed Americans nicknamed it ____</p>
  <p>Say Jess writes "Turkeygate", Omar writes "the Fake Feast" and your roommate writes "Thanksgetting". The truth: Franksgiving. Whoever picked "Thanksgetting" just gave your roommate points, and the table now has a new name for this dinner too.</p>
</div>
<h2>Why it works for Friendsgiving</h2>
<ul>
  <li><strong>Nobody needs to know trivia.</strong> Nobody knows these facts. The game is about a straight face and knowing which friend will believe anything.</li>
  <li><strong>Mixed tables mix.</strong> College friends, work friends and someone's new partner start level, because nobody knows the answers. By the second question they are lying to each other like old friends.</li>
  <li><strong>Up to 12 phones a game.</strong> A bigger crowd plays in pairs, one phone per pair, which also works for the friend who is still carving.</li>
  <li><strong>Short.</strong> A game of 5 questions takes about ten minutes, so it fits between the main course and pie. "Rematch" at the end starts another with the same players and new questions.</li>
  <li><strong>Free, no app, no sign-up.</strong> Whoever arrives late with the ice joins with the PIN in seconds.</li>
</ul>
<h2>A TV in the room?</h2>
<p>You don't need one: the phones are enough. But if there is a TV, open bullshit.wtf on a laptop connected to it, click "Present Game" and type the game's PIN. The TV shows the questions, every answer, who fell for what and the scores; the phones are only for writing and picking.</p>
<h2>Make it the yearly game</h2>
<p>At the end of a game you can save the group as a crew. The crew gets its own page, with standings that carry over from game to game, so this year's biggest bullshitter has to defend the title at next year's Friendsgiving.</p>
<h2>How to start</h2>
<ol>
  <li>Tap "Start a Friendsgiving game" on this page. "Thanksgiving questions" is already ticked. Choose 5, 7 or 9 questions and tap "Create".</li>
  <li>The game shows a four-letter PIN and an invite link. Drop the link in the group chat, or everyone opens bullshit.wtf on their phone, taps "Join Game" and types the PIN.</li>
  <li>Everyone picks a nickname. When everyone is in, whoever opened the game taps "Start".</li>
</ol>
<h2>Good to know first</h2>
<ul>
  <li><strong>The name is a swear word</strong>, and it is on the screens, including the "biggest bullshitter" title at the end. Among grown-up friends that is usually half the fun.</li>
  <li><strong>The questions are not adult ones.</strong> They are strange true facts. What gets typed as a lie is up to your friends.</li>
  <li><strong>Each phone needs internet.</strong> Put the Wi-Fi password on the fridge.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Playing with family on Thursday too? See <a href="/thanksgiving-party-game">the Thanksgiving family page</a>.</p>`;

module.exports = {
    pages: (en) => [
        {
            path: '/thanksgiving-party-game', site: en, tag: 'seo-en-thanksgiving',
            start: { href: '/create-game?lang=en&pack=thanksgiving', label: 'Start a Thanksgiving game' },
            image: '/assets/og-thanksgiving-en.png',
            title: 'Thanksgiving party game for the family on TV · Bullshit',
            description: 'After the turkey: Bullshit is a free bluffing trivia game with Thanksgiving questions. Everyone writes a lie on their phone, the TV shows who fell for it.',
            h1: 'A Thanksgiving game for the whole family, on the TV',
            body: thanksgiving,
        },
        {
            path: '/friendsgiving-games', site: en, tag: 'friendsgiving',
            start: { href: '/create-game?lang=en&pack=thanksgiving', label: 'Start a Friendsgiving game' },
            image: '/assets/og-friendsgiving-en.png',
            title: 'Friendsgiving games for adults, on your phones · Bullshit',
            description: 'A Friendsgiving game for the whole table: everyone writes a lie on their own phone and hunts for the truth. Free, no app, Thanksgiving questions mixed in.',
            h1: 'A Friendsgiving game for the whole table',
            body: friendsgiving,
        },
    ],
};
