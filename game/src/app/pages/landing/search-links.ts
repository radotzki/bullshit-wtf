/**
 * The links from the home menu to the plain search pages (game/seo): a small row under the menu, in
 * the visitor's language, and in Hanukkah season one line above the buttons. Until now the app linked
 * these pages only inside <noscript>, so search engines saw no link to them from the home page.
 * Kept free of Angular so it can be tested in Node (test/search-links.test.js).
 */

export interface SearchLink {
    href: string;
    label: string;
}

const rows: { [lang: string]: SearchLink[] } = {
    en: [
        { href: '/how-to-play', label: 'How to play' },
        { href: '/hanukkah-party-game', label: 'Hanukkah' },
        { href: '/party-games-on-your-phone', label: 'Party games on your phone' },
        { href: '/classroom-game', label: 'Classroom' },
        { href: '/team-building-game', label: 'Team building' },
    ],
    he: [
        { href: '/he/how-to-play', label: 'איך משחקים' },
        { href: '/he/hanukkah', label: 'חנוכה' },
        { href: '/he/friday-dinner', label: 'ארוחת שישי' },
        { href: '/he/classroom', label: 'בכיתה' },
        { href: '/he/team-building', label: 'גיבוש' },
    ],
};

/**
 * English links for the December holidays, added to the end of the English row from 20 November to
 * 1 January only, so the year-round row stays short. Next year's days go in `holidaySeasons`.
 */
const holidays: SearchLink[] = [
    { href: '/christmas-party-game', label: 'Christmas' },
    { href: '/new-years-eve-party-game', label: 'New Year\'s Eve' },
    { href: '/office-holiday-party-game', label: 'Office party' },
];

export const holidaySeasons: { from: string; to: string }[] = [
    { from: '2026-11-20', to: '2027-01-01' },
];

/**
 * Thanksgiving (US, Thursday 26 November 2026), English only. The row shows its page all November;
 * the line above the buttons shows on the days English games are offered the Thanksgiving pack, by
 * the visitor's own calendar. Next year's days go here (2027: Thursday 25 November).
 */
const thanksgivingRow: SearchLink = { href: '/thanksgiving-party-game', label: 'Thanksgiving' };
const thanksgiving: SearchLink = { href: '/thanksgiving-party-game', label: 'Thanksgiving is here: play with Thanksgiving questions' };

export const thanksgivingRowSeasons: { from: string; to: string }[] = [
    { from: '2026-11-01', to: '2026-11-29' },
];

export const thanksgivingSeasons: { from: string; to: string }[] = [
    { from: '2026-11-20', to: '2026-11-29' },
];

const hanukkah: { [lang: string]: SearchLink } = {
    en: { href: '/hanukkah-party-game', label: 'Hanukkah is here: play with Hanukkah questions' },
    he: { href: '/he/hanukkah', label: 'חנוכה כאן: משחקים עם שאלות חנוכה' },
};

/**
 * The days the home menu shows the Hanukkah line, by the visitor's own calendar, first and last day
 * included. Hanukkah moves every year: add next season's days here (2027: 24 December to 2 January).
 */
export const hanukkahSeasons: { from: string; to: string }[] = [
    { from: '2026-12-01', to: '2026-12-13' },
];

/** A link keeps the visitor's post tag (?via=), so a game started from the page still counts for the post. */
function withTag(link: SearchLink, campaign: string | null): SearchLink {
    return campaign ? { href: link.href + '?via=' + encodeURIComponent(campaign), label: link.label } : link;
}

function day(d: Date): string {
    const two = (n: number) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}

/** The row of links under the home menu; in December's holiday season the English row adds the holiday pages. */
export function searchLinks(locale: string, campaign: string | null, today: Date = new Date()): SearchLink[] {
    const d = day(today);
    const lang = locale === 'he' ? 'he' : 'en';
    const inSeason = lang === 'en' && holidaySeasons.some(s => s.from <= d && d <= s.to);
    const turkey = lang === 'en' && thanksgivingRowSeasons.some(s => s.from <= d && d <= s.to);
    return rows[lang].concat(turkey ? [thanksgivingRow] : [], inSeason ? holidays : []).map(l => withTag(l, campaign));
}

/**
 * The season's line above the buttons: Thanksgiving on its days (English only), Hanukkah on the
 * days of its season; null on every other day.
 */
export function seasonLink(locale: string, today: Date, campaign: string | null): SearchLink | null {
    const d = day(today);
    if (locale !== 'he' && thanksgivingSeasons.some(s => s.from <= d && d <= s.to)) {
        return withTag(thanksgiving, campaign);
    }
    const inSeason = hanukkahSeasons.some(s => s.from <= d && d <= s.to);
    return inSeason ? withTag(hanukkah[locale === 'he' ? 'he' : 'en'], campaign) : null;
}
