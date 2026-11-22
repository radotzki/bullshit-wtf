// A ready Hanukkah activity for Jewish youth groups, Hillels and synagogue teen programs, whole, on the game's own
// site: /hanukkah-youth-group-activity. Leaders of groups of 10 to 30 teens plan the Hanukkah-week meeting by
// searching for a ready activity; this page is that activity, from the opener to the closing discussion and two
// handouts, and it prints on paper without the site's buttons (the print rules at the top of the body).
//
// The English twin, in substance, of the counselors' Hebrew page (seo/pages-he-hanukkah-activity.js, pull request
// #239): the same checked game facts, framed for English-speaking groups abroad. Not marked as its `twin`, so the
// two pages can merge in either order; they can be paired once both are live.
// What it rests on, read on master in November 2026:
//  - 12 seats a game (MAX_PLAYERS) and the leader who opens it takes one, so 11 teams: up to 22 teens in pairs;
//  - a rematch (REMATCH) plays as many questions as the first game (fork.ts copies totalQ), so 5 and then 5,
//    and it keeps the game's question pack;
//  - English games do NOT get the Hanukkah questions by themselves (the Hanukkah pack's seasonIn is Hebrew only,
//    and English games get the Christmas pack from 1 December). ?pack=hanukkah on the Start button offers the
//    Hanukkah pack ticked on the Create page, on any date, as /hanukkah-party-game does: 3 Hanukkah questions a game;
//  - "Kids are playing" on the Create page takes the place of the Hanukkah questions (one pack a game);
//  - the nickname box takes 9 letters, so a team name is 9 at most;
//  - no filter on the lies: they go up as typed.
// test/hanukkah-activity-en-page.test.js checks these numbers, the buttons it names and its tags.

const TAG = 'hanukkah-activity-en';
// A leader forwarding the page to co-leaders: tagged apart from the page's own Start button, which then carries
// this tag in place of TAG (build-pages.js keeps a visitor's ?via= on the page's links).
const MAIL_TAG = 'mail-en-hanukkah-activity';
const PAGE_URL = 'https://bullshit.wtf/hanukkah-youth-group-activity';

const mailSubject = 'A ready Hanukkah activity for our group (45 minutes, phones)';
const mailBody = [
    'A full 45-minute Hanukkah activity for teens: a true-or-false opener, a bluffing game on phones, and a closing discussion on the two stories of Hanukkah. Free, nothing to install, printable:',
    PAGE_URL + '?via=' + MAIL_TAG,
].join('\n\n');
const mail = 'mailto:?subject=' + encodeURIComponent(mailSubject) + '&body=' + encodeURIComponent(mailBody);

// Print: paper gets the activity alone (no header, buttons, menu or footer), black on white, with the
// page's address on top so a leader holding the sheet can still open the game.
const printStyle = `<style>
  .print-only { display: none; }
  .plan td:first-child { white-space: nowrap; }
  .box { background: #fff; border: 1px solid #e6d9cc; border-radius: 8px; padding: 4px 16px; margin: 12px 0; }
  button.btn { font: inherit; font-size: 19px; font-weight: 600; background: none; cursor: pointer; }
  @media print {
    @page { margin: 12mm; }
    header, footer, nav.more, .cta, .no-print { display: none !important; }
    body { background: #fff; color: #000; font-size: 10.5pt; line-height: 1.4; }
    main { max-width: none; padding: 0; }
    h1 { font-size: 22pt; margin: 0 0 6pt; color: #000; }
    h2 { font-size: 14pt; margin: 14pt 0 4pt; color: #000; break-after: avoid; }
    h3 { font-size: 12pt; margin: 10pt 0 2pt; break-after: avoid; }
    table, .box, li { break-inside: avoid; }
    th { background: #eee; }
    a { color: #000; text-decoration: none; }
    .print-only { display: block; }
    .annex { break-before: page; }
  }
</style>`;

const body = `
${printStyle}
<p class="print-only">The full activity, and the button that opens the game: <bdi dir="ltr">bullshit.wtf/hanukkah-youth-group-activity</bdi></p>
<p><strong>The idea:</strong> Hanukkah is a story we have been retelling for two thousand years. In this activity your teens make up stories of their own, find out how easy it is to believe a good lie, and talk about what we believe, what we check, and what we pass on.</p>
<div class="box">
<p><strong>Ages:</strong> grades 7 to 12 (and it works just as well for college students at Hillel).<br>
<strong>Length:</strong> 45 minutes.<br>
<strong>Group size:</strong> 10 to 30, in one or two games (see "A big group?" below).<br>
<strong>The tool:</strong> a bluffing game on phones, in the browser. Free, no app, no sign-up, nothing to download.</p>
</div>
<!--start-->
<p class="no-print"><button type="button" class="btn secondary" onclick="window.print()">Print this activity</button></p>
<h2>Goals</h2>
<ul>
  <li>Know the two stories of Hanukkah: the revolt and the war, and the jar of oil.</li>
  <li>Feel for ourselves how easy it is to make something sound true, and how easy it is to fall for it.</li>
  <li>Talk about trust: what we believe, what we check, and what we pass on.</li>
  <li>Most of all: laugh together in Hanukkah week.</li>
</ul>
<h2>What to bring</h2>
<ul>
  <li><strong>One phone for every pair of teens</strong> (or one each, in a group of up to 11, since the leader plays too). The game runs in the browser: no app, no sign-up, nothing to download, and it is free.</li>
  <li><strong>Internet:</strong> the building's Wi-Fi, or the teens' own data.</li>
  <li><strong>A projector or TV with a laptop, if you have one.</strong> Not a must, but it turns the game into the whole room's game.</li>
  <li><strong>The 5 statements for the opener</strong> (Handout A).</li>
  <li><strong>In case the internet goes down:</strong> paper, pens and Handout B.</li>
</ul>
<h2>Before the meeting (5 minutes at home)</h2>
<p>Tap "Start a Hanukkah game" on this page, then "CREATE", and in the empty lobby tap "Try 5 quick questions alone". You see what it looks like, and you don't learn the game in front of the group.</p>
<p><strong>A word on the name.</strong> The game is called "Bullshit", and in English that is a swear word. It is on the screens and in the address. Most teens will laugh; you know your group, your parents and your building. If you would rather not say it, call it "the game" and let the screens do the rest.</p>
<p><strong>Plan it for a weekday.</strong> Hanukkah 2026 starts on the evening of Friday 4 December, so the first night and the next day are Shabbat. Groups that keep phones off on Shabbat can run it any evening from Saturday night 5 December to Friday afternoon 11 December.</p>
<h2>The plan at a glance</h2>
<table class="plan">
  <tr><th>Minutes</th><th>What happens</th></tr>
  <tr><td>0–7</td><td>Opener: true or made up?</td></tr>
  <tr><td>7–12</td><td>Pairs, and everyone joins the game</td></tr>
  <tr><td>12–21</td><td>Game 1: 5 questions</td></tr>
  <tr><td>21–25</td><td>Quick pause: which lie worked, and why?</td></tr>
  <tr><td>25–33</td><td>Game 2: the rematch, 5 questions</td></tr>
  <tr><td>33–45</td><td>Discussion: the two stories of Hanukkah</td></tr>
</table>
<h2>Opener: true or made up? (0–7 min)</h2>
<p>Mark one side of the room "True" and the other "Made up". Read a statement about Hanukkah from Handout A, and everyone walks to the side they believe. After each one, reveal the answer.</p>
<p>The point: some true things sound completely made up, and some inventions sound very believable. Now it's their turn to invent.</p>
<h2>Pairs and joining (7–12 min)</h2>
<ol>
  <li>Split into pairs, one phone per pair (for a big group, see "A big group?" below). Each pair picks a short team name, 9 letters at most, and types it as the nickname.</li>
  <li>The leader taps "Start a Hanukkah game" on this page (<bdi dir="ltr">bullshit.wtf/hanukkah-youth-group-activity</bdi>), picks 5 questions and taps "CREATE". The leader types a nickname too and plays with everyone: the leader takes one of the 12 seats, and writes lies too. Tip: open the game before the opener, and joining takes no more than five minutes.</li>
  <li>A four-letter PIN appears, with a QR code and a link. The teens scan it, or open <bdi dir="ltr">bullshit.wtf</bdi>, tap "Join Game" and type the PIN.</li>
  <li>Got a projector? On its laptop, open <bdi dir="ltr">bullshit.wtf</bdi>, click "Present" and type the PIN. The questions, the answers and the scores go up on the wall.</li>
  <li>When everyone is in, the leader taps "START".</li>
</ol>
<h2>Game 1: 5 questions (12–21 min)</h2>
<p>How it works: a strange true fact appears on the screen, with a blank where its most interesting part should be. Each pair whispers and writes a made-up answer that will fool the others. Then all the answers go up together: everyone's lies, a few lies the game adds itself, and the truth. Each pair picks what it believes. You score for finding the truth, and again for every pair that falls for your lie. Pick one of the game's own lies and you lose points.</p>
<p>A game opened from this page's button has three Hanukkah questions in every game, on any date. On the page where you open the game, under "Special:", "Hanukkah questions" is ticked: leave it ticked. Leave "Kids are playing" off: it is for ages 8 to 12, and it takes the place of the Hanukkah questions. An English game opened from the home page in December gets Christmas questions instead, so open it from this page's button.</p>
<p>Tip: before the first question, agree on what is OK to write. The answers go up on the screen exactly as typed.</p>
<h2>Quick pause (21–25 min)</h2>
<p>The last screen shows each team's best lie. Ask:</p>
<ul>
  <li>Which lie fooled the most teams? Who wrote it?</li>
  <li>Why did you believe it? What made it sound true?</li>
  <li>Who fell for everything? (There's always one.)</li>
</ul>
<h2>Game 2: the rematch, 5 questions (25–33 min)</h2>
<p>Tap "REMATCH": the same teams, the same number of questions, new questions, and the Hanukkah questions again. Now everyone knows what works on whom, and the lies get smarter. Swap who holds the phone in each pair.</p>
<h2>Discussion: the two stories of Hanukkah (33–45 min)</h2>
<p>Sit in a circle. The leader tells it briefly:</p>
<p>In the Books of Maccabees, written in the time of the Hasmoneans or a little after, Hanukkah is a story of war: the few against the many, a revolt that began in Modi'in, a victory, and the Temple purified and rededicated. The story of the small jar of oil that lasted eight days is not there. It appears in the Talmud, written down centuries later. Today most of us know the oil story first, and both stories have been handed down for generations.</p>
<p>Questions to talk about (pick two or three):</p>
<ul>
  <li>Which of the two stories do you know better? Why do you think that one stuck?</li>
  <li>What makes a story get passed down from generation to generation? And what made your lies in the game work: a small exact detail? Confidence? Who said it?</li>
  <li>Where in our lives do we hear things that sound true and don't check? (The group chat, TikTok, a rumor at school.)</li>
  <li>What is the difference between a story handed down for generations and a rumor we forward without checking?</li>
  <li>Who do you trust when you're not sure? And what do you do to check?</li>
</ul>
<p>To close: announce the winning pair, and if it fits your group, light the candles together. Happy Hanukkah!</p>
<h2>A big group?</h2>
<p>One game takes up to 12 phones, and the leader who opened the game takes one of them (and writes lies too). So: up to 11 teams in a game.</p>
<ul>
  <li><strong>Up to 11 teens:</strong> everyone on their own phone, one game.</li>
  <li><strong>12 to 22 teens:</strong> pairs on one phone (up to 11 pairs), one game. This is the activity's default: whispering over the lie is half the fun.</li>
  <li><strong>23 to 30 teens:</strong> threes on one phone (up to 11 teams), or two games side by side with two leaders, each game with its own PIN.</li>
  <li><strong>More than 30:</strong> two or three games side by side, a leader for each. Each leader opens a game and writes its PIN on the board, and each group joins its own PIN. One projector shows one game, so the others play on their phones. At the end, the winning pair from each game goes to a one-question final, read aloud from Handout B.</li>
  <li><strong>Few phones in the room?</strong> Teams of three or four on one phone, and the game on the projector.</li>
</ul>
<h2>If something goes wrong</h2>
<ul>
  <li><strong>A phone drops out or closes:</strong> the game goes on without it. Join the same PIN again, from the same phone and the same browser, and you usually get the same seat back. From another phone or browser the team gets a new seat, at 0 points, and only if a seat is free: a full game of 12 has none.</li>
  <li><strong>Someone arrives late:</strong> they can join after the game has started, as long as there is a seat (12 including the leader).</li>
  <li><strong>The leader's phone drops:</strong> the game keeps running without it. Join again with the same PIN.</li>
  <li><strong>No internet at all:</strong> switch to the paper version (Handout B). The leader reads a fact with a blank, each pair writes a lie on paper and hands it in, the leader reads all the lies and the truth mixed together, and each pair votes. A point for finding the truth, and a point for every pair that fell for your lie. Same activity, same discussion at the end.</li>
</ul>
<h2 class="annex">Handout A: true or made up? (for the opener)</h2>
<ol>
  <li>The story of the jar of oil that lasted eight days is not in the Books of Maccabees. <strong>True.</strong></li>
  <li>Dreidels outside Israel have the letter shin ("a great miracle happened there"), and dreidels in Israel have pe ("a great miracle happened here"). <strong>True.</strong></li>
  <li>The revolt of Mattathias and his sons began in Modi'in. <strong>True.</strong></li>
  <li>A menorah has nine branches because Hanukkah used to last nine days. <strong>Made up.</strong> The ninth is the shamash, the candle used to light the others.</li>
  <li>The Maccabees won their first battle because the Greek army's elephants were scared of their torches. <strong>Made up.</strong> There were elephants, but in another battle (Beth Zechariah), and the Maccabees lost that one.</li>
</ol>
<h2>Handout B: questions for the paper version (if there's no internet)</h2>
<ol>
  <li>The word "Hanukkah" means ____, as in the rededication of the Temple. (dedication)</li>
  <li>The four letters on a dreidel are nun, gimel, hei and ____. (shin, or pe in Israel)</li>
  <li>The candle used to light the other Hanukkah candles is called the ____. (shamash)</li>
  <li>The revolt of the Maccabees began in the town of ____. (Modi'in)</li>
  <li>The story of the jar of oil that lasted eight days appears in the ____. (Talmud)</li>
</ol>
<div class="no-print">
<h2>More for leaders</h2>
<p>For any week of the year, <a href="/classroom-game">the classroom page</a> has how to put the game on a projector and split a room into teams. For Hanukkah at home with family, see <a href="/hanukkah-party-game">the Hanukkah party game</a>, and the full rules are in <a href="/how-to-play">How to play</a>.</p>
<p class="cta"><a class="btn secondary" href="${mail}">Email this to your co-leaders</a></p>
</div>`;

module.exports = {
    TAG,
    MAIL_TAG,
    pages: (en) => [
        {
            path: '/hanukkah-youth-group-activity', site: en, tag: TAG,
            start: { href: '/create-game?lang=en&pack=hanukkah', label: 'Start a Hanukkah game' },
            image: '/assets/og-hanukkah-activity-en.png',
            title: 'Hanukkah youth group activity, ready to run · Bullshit game',
            description: 'A ready 45-minute Hanukkah activity for youth groups, grades 7 to 12: a bluffing game on phones, a true-or-false opener, a discussion on the two Hanukkah stories. Free, printable.',
            h1: 'A Hanukkah activity: who here believes anything?',
            body,
        },
    ],
};
