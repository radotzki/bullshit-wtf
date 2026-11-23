// A page for people who look for a free party game of the kind groups buy in paid packs: one shared screen
// (a TV or a laptop) shows the game, and everyone plays on their own phone. They search for the kind of
// game ("free party games for TV and phones", "games like Jackbox for free", "phone controller party game"),
// often in December, when a group prices a pack for its holiday party. English only: no Hebrew search for a
// free alternative to a paid party game was found beyond the one /he/game-like-jackbox already answers.
//
// The page is written around the kind of game, not a brand. /free-jackbox-alternative is the side-by-side
// comparison; this page names a paid pack once, only to say what kind of game this is and that this one is
// free, and links there. No logo, no picture of another company's game, no word of any tie to them. Of the
// paid packs it says only what /free-jackbox-alternative already says (looked at in review 107): they are
// paid, one person buys a pack and runs it on a shared screen, and each pack holds several games.
//
// Of Bullshit, only what the game does (November 2026): free, in the browser, no download, no account, up
// to 12 phones a game, 5, 7 or 9 questions, three rounds where points grow, house lies, a QR code on the big
// screen to join, "USE AS THE BIG SCREEN" in a computer host's lobby (big-screen-host.ts), "Present Game" on
// the home page, Rematch, English and Hebrew questions. Its own tag, seo-en-free-party-game, so the groups it
// brings are counted apart from the other search pages.

const example = (q, story) => `<div class="example">
  <p class="q">${q}</p>
  <p>${story}</p>
</div>`;

const freePartyGameEn = `
<p>The questions on the TV, everyone answering on their own phone, the room shouting at the screen: Bullshit is that kind of party game, and it's free. It runs in the browser, so there is nothing to buy, download or sign up for.</p>
<!--start-->
<h2>What you play</h2>
<p>Bullshit is a bluffing trivia game. A strange true fact appears with a blank. Everyone writes a lie that could fill it, one that sounds true enough to fool the others. Then every answer appears on the screen together: all the lies, a few lies the game adds itself, and the truth. Everyone picks the one they believe.</p>
${example('Counting by the number made, the world\'s biggest maker of tires is ____',
    'Say Maya writes "Michelin", Ben writes "Hot Wheels" and Priya writes "the US Army". Half the room goes for Michelin, which gives Maya points. The truth is Lego: it makes hundreds of millions of tiny tires every year.')}
<p>You score for finding the truth and for every friend who falls for your lie. Fall for one of the game's own lies and you lose points. There are three rounds and the points grow each round, so nobody is out of it until the last question, and at the end the game names the biggest bullshitter in the room.</p>
<h2>Putting it on the TV</h2>
<p>Any screen with a web browser can be the big screen: a laptop plugged into the TV, a computer by the projector, the screen in the meeting room. Two ways to set it up:</p>
<ol>
  <li><strong>Start the game on the big screen.</strong> On the laptop or computer, open bullshit.wtf, click "Create Game", choose English or Hebrew questions and 5, 7 or 9 questions, create it and type your name. In the lobby, click "Use as the big screen". The screen shows a QR code and a four-letter PIN, everyone scans the code with their phone to join, you join from your own phone too, and you press Start on the big screen.</li>
  <li><strong>Or start it on a phone first.</strong> Someone creates the game on their phone. Then open bullshit.wtf on the big screen, click "Present Game" and type the game's PIN.</li>
</ol>
<p>Either way, the big screen shows the question, all the answers, who picked what and the scores, with music and sounds, and the phones are only for writing lies and picking answers. No TV in the room? The game works on phones alone: each phone shows the question, the answers and the scores.</p>
<h2>On a video call too</h2>
<p>For a party where some guests are far away, put the big screen in the call: open it on a computer as above and share that browser window, so everyone sees the questions and the scores. Guests join from their own phones wherever they are. More on that: <a href="/video-call-party-game">a party game for a video call</a>.</p>
<h2>Like a paid party pack, but free</h2>
<p>Paid party packs, such as The Jackbox Party Pack, work the same way on the surface: one shared screen, and players join on their phones. One person buys a pack, and each pack holds several different games. Bullshit is one game, the write-a-lie, find-the-truth kind, and it costs nothing, so anyone in the group can start it, at any party, without one person paying. If your group wants many kinds of game in one night, a pack may suit you better. For the full side-by-side, see <a href="/free-jackbox-alternative">a free Jackbox alternative</a>.</p>
<h2>Good to know</h2>
<ul>
  <li><strong>Is it really free?</strong> Yes. No paid packs, no ads in the game, no sign-up.</li>
  <li><strong>How many can play?</strong> Up to 12 phones a game. A bigger party can play in teams, a phone per team.</li>
  <li><strong>How long is a game?</strong> 5 questions take about ten minutes. "Rematch" at the end starts a new game with the same players and new questions.</li>
  <li><strong>What do the phones need?</strong> A browser and internet. Any phone works: nothing to install.</li>
  <li><strong>Which languages?</strong> Questions in English and in Hebrew.</li>
</ul>
<h2>How to start</h2>
<ol>
  <li>Tap "Start a free game" on this page, on the computer that will be the big screen or on your phone. Choose your questions and tap "Create".</li>
  <li>The game shows a four-letter PIN and an invite link. On the big screen, guests scan the QR code; on a phone, send the link to the group, or everyone opens bullshit.wtf, taps "Join Game" and types the PIN.</li>
  <li>Everyone picks a nickname. When everyone is in, press "Start".</li>
</ol>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. More on the phone side: <a href="/party-games-on-your-phone">party games on your phone</a>.</p>
<p><small>Jackbox and The Jackbox Party Pack are trademarks of Jackbox Games. Bullshit is an independent game and is not made by, endorsed by or connected to Jackbox Games.</small></p>`;

module.exports = {
    pages: (en) => [
        {
            path: '/free-party-game-tv-and-phones', site: en, tag: 'seo-en-free-party-game',
            start: { href: '/create-game?lang=en', label: 'Start a free game' },
            image: '/assets/og-free-party-game-en.png',
            title: 'Free party game for your TV and phones · Bullshit',
            description: 'The party game with the questions on the TV and everyone playing on their phone, free: write a lie, find the truth. In the browser, no download, up to 12 players.',
            h1: 'A free party game for the TV and everyone\'s phones',
            body: freePartyGameEn,
        },
    ],
};
