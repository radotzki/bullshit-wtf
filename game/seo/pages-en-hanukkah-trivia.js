// English Hanukkah trivia on the game's own site: /hanukkah-trivia. The English twin of the Hebrew adults'
// quiz page (/he/hanukkah-quiz, seo/pages-he-hanukkah-quiz.js), with questions of its own.
// People who search "Hanukkah trivia questions and answers" (and "Hanukkah trivia for adults", "Hanukkah
// quiz", "Chanukah trivia") want the questions themselves, to read out at the family table. So the page
// gives them 12 true questions with their answers first, and then the game: the same evening, played so
// that everyone invents a fake answer.
//
// The rules for the questions:
//  - each answer is a true fact that can be checked; the report beside the pull request
//    (reports/hanukkah-trivia-page.md in the project's files) names a source for each one;
//  - none is a question of the game's own Hanukkah pack (functions/data/hanukkah-questions.json), and none
//    names a pack answer or repeats a pack question's words, so the page spoils no game:
//    test/hanukkah-trivia-page.test.js checks it against the pack's English questions;
//  - for adults and families: the rules people half remember, the synagogue side most never saw, and a
//    little pop culture.
// The Start button opens an English game with the Hanukkah questions on any date (?pack=hanukkah, as on
// /hanukkah-party-game), tagged hanukkah-trivia, so groups that came from this page are counted apart.

const TAG = 'hanukkah-trivia';

// Each question as it is read aloud, then its answer. The answer sits in a <details>, so whoever reads
// from the phone sees it only when they open it. `answer` is the short form the test looks for.
const questions = [
    {
        q: 'In 2026 the first candle falls on a Friday evening. Which do you light first: the menorah or the Shabbat candles?',
        a: 'The menorah. Once the Shabbat candles are lit, Shabbat has begun for whoever lit them, and that person can no longer light a menorah until Saturday night.',
        answer: 'The menorah',
    },
    {
        q: 'How many blessings are said over the candles on the first night, and how many on the other nights?',
        a: 'Three on the first night: "to light the Hanukkah candle", "who performed miracles for our ancestors" and Shehecheyanu, "who has kept us alive". From the second night on, two: Shehecheyanu is left out.',
        answer: 'Three, then two',
    },
    {
        q: 'Candles are fine for a menorah. But which fuel does Jewish law call the very best choice?',
        a: 'Olive oil. Any oil or candle will do, but olive oil is the finest way to keep the mitzvah, since it burns clear and recalls the oil of the Temple.',
        answer: 'Olive oil',
    },
    {
        q: 'Does everyone in the family light a menorah of their own, or one for the whole house?',
        a: 'It depends where your family comes from. By Ashkenazi custom, each member of the household lights their own. By the main Sephardi custom, one person lights for the whole house.',
        answer: 'It depends where your family comes from',
    },
    {
        q: 'An old custom says women do no housework at a certain time during Hanukkah. When?',
        a: 'While the Hanukkah candles are burning. The reason given: women had a part in the Hanukkah miracle too. So if anyone asks you to do the dishes right after lighting, you have a source.',
        answer: 'While the candles are burning',
    },
    {
        q: 'Jewish tradition says Antiochus banned three commandments above all others. Which three?',
        a: 'Shabbat, the new month and circumcision: keeping the Sabbath, fixing the calendar by the new moon, and the brit milah.',
        answer: 'Shabbat, the new month and circumcision',
    },
    {
        q: 'Hanukkah gets the full Hallel, the psalms of praise, on every one of its days. On how many days of Passover is the full Hallel said?',
        a: 'Only the first day in Israel, and the first two days abroad. On the rest of Passover a shortened Hallel is said. Hanukkah, a holiday that is not even in the Hebrew Bible, gets more days of full Hallel than Passover.',
        answer: 'Only the first day',
    },
    {
        q: 'Passover and Shavuot each get an extra holiday day outside Israel. How long is Hanukkah outside Israel?',
        a: 'No extra day: it lasts just as long as in Israel. The extra day abroad belongs to the festivals that the Torah commands, and Hanukkah was set up by the rabbis.',
        answer: 'No extra day',
    },
    {
        q: 'Which part of the Torah is read in synagogue on the weekdays of Hanukkah?',
        a: 'Numbers chapter 7: the gifts that the leaders of the twelve tribes brought, one leader a day, after Moses finished setting up the Tabernacle in the desert. A holiday about the Temple reads about the first sanctuary.',
        answer: 'Numbers chapter 7',
    },
    {
        q: 'On the Shabbat of Hanukkah, a famous line from the prophet Zechariah is read in synagogue. What is it?',
        a: '"Not by might, nor by power, but by My spirit, says the Lord of hosts" (Zechariah 4:6). The reading comes with a vision of a golden lampstand fed by two olive trees.',
        answer: 'Not by might, nor by power',
    },
    {
        q: 'In what year did the United States Postal Service issue its first Hanukkah stamp, and what was unusual about it?',
        a: '1996. It was a joint issue with Israel: both countries printed the same design.',
        answer: '1996',
    },
    {
        q: 'In which 1990s Nickelodeon cartoon do babies imagine themselves as the "Maccababies", fighting a king they call Antonica?',
        a: 'Rugrats. "A Rugrats Chanukah" first aired on Nickelodeon in December 1996: Grandma Minka reads the Hanukkah story to the babies, and they imagine themselves inside it.',
        answer: 'Rugrats',
    },
];

const quiz = questions.map((x) => `  <li>
    <p class="q">${x.q}</p>
    <details><summary>Answer</summary><p>${x.a}</p></details>
  </li>`).join('\n');

const style = `<style>
  ol.quiz { padding-inline-start: 26px; }
  ol.quiz li { margin: 14px 0; }
  ol.quiz .q { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  ol.quiz details { background: #fff; border: 1px solid #e6d9cc; border-radius: 8px; padding: 6px 12px; }
  ol.quiz summary { cursor: pointer; color: var(--wine); font-weight: 600; }
  ol.quiz details p { margin: 6px 0 2px; }
</style>`;

const body = `
${style}
<p>12 Hanukkah trivia questions with answers, for adults and the whole family, to read aloud at the table after candle lighting. Not "how many nights does Hanukkah last": questions that start an argument between the cousin who went to Hebrew school and the uncle who is sure he knows. One person reads, everyone answers, and only then does someone tap "Answer".</p>
<!--start-->
<h2>12 Hanukkah trivia questions and answers</h2>
<ol class="quiz">
${quiz}
</ol>
<h2>Or play it as a game</h2>
<p>A normal quiz is over once one person knows everything. Bullshit turns it around: a strange true Hanukkah fact appears with a blank, and everyone, on their own phone, writes a fake answer that will sound real to the rest of the family. Then all the answers come up together, everyone's lies and the truth, and everyone picks the one they think is true. You score for finding the truth, and more for everyone who falls for your lie. So the relative who remembers nothing about Hanukkah can still win, if they lie well.</p>
<ul>
  <li><strong>Hanukkah questions in the game:</strong> the button opens an English game with Hanukkah questions, different from the ones on this page, so nobody comes prepared.</li>
  <li><strong>Up to 12 players</strong>, each on their own phone, and a TV or laptop can show the game to the whole room.</li>
  <li><strong>Free, no app and no sign-up.</strong> Whoever starts the game gets a PIN, and everyone else joins in a minute.</li>
  <li><strong>Games of 5, 7 or 9 questions</strong>, in three rounds where the points grow.</li>
</ul>
<p>Good for a Hanukkah night with parents, aunts, uncles and older kids, and for a Hanukkah party with friends. More about a Hanukkah night with the game is on <a href="/hanukkah-party-game">the Hanukkah party game page</a>, and the full rules are in <a href="/how-to-play">how to play</a>.</p>`;

module.exports = {
    TAG,
    questions,
    pages: (en) => [
        {
            path: '/hanukkah-trivia', site: en, tag: TAG,
            start: { href: '/create-game?lang=en&pack=hanukkah', label: 'Start a Hanukkah game' },
            image: '/assets/og-hanukkah-trivia-en.png',
            title: 'Hanukkah trivia questions and answers + a game · Bullshit',
            description: 'Hanukkah trivia questions and answers for adults and families: 12 surprising ones to read aloud. Then a free Hanukkah game where everyone fakes an answer.',
            h1: 'Hanukkah trivia: 12 questions and answers for the family table',
            body,
        },
    ],
};
