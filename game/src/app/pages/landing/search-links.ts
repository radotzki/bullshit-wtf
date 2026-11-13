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

/** The row of links under the home menu. */
export function searchLinks(locale: string, campaign: string | null): SearchLink[] {
    return (rows[locale === 'he' ? 'he' : 'en']).map(l => withTag(l, campaign));
}

function day(d: Date): string {
    const two = (n: number) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}

/** The Hanukkah line above the buttons, on the days of the season; null on every other day. */
export function seasonLink(locale: string, today: Date, campaign: string | null): SearchLink | null {
    const d = day(today);
    const inSeason = hanukkahSeasons.some(s => s.from <= d && d <= s.to);
    return inSeason ? withTag(hanukkah[locale === 'he' ? 'he' : 'en'], campaign) : null;
}
