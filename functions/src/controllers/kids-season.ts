import { questionPacks, KIDS_PACK, kidsSeasonPack } from '../game-model';
import { isRetired } from './retired-questions';

/**
 * A kids game ("Kids are playing") in a holiday's season: the holiday's kid-friendly questions
 * (QuestionPack.kidsToo) in this game's question bank, for withSeasonKids to mix in. `holiday` is the
 * game's kidsHoliday (an English game from the Hanukkah page); without it, the holiday the language
 * gets by default today (Hebrew: Hanukkah; English: Thanksgiving). Any other game, or a kids game
 * out of season, gets none, so adult games pick exactly as before.
 */
export function kidsSeasonQuestions(pack: string | undefined, lang: string, bankIds: string[],
    now: number = Date.now(), holiday?: string): string[] {
    if (pack !== KIDS_PACK) {
        return [];
    }
    const season = kidsSeasonPack(now, lang, holiday);
    if (!season) {
        return [];
    }
    const inBank = new Set(bankIds);
    return (questionPacks[season].kidsToo || []).filter(id => inBank.has(id) && !isRetired(id));
}

/**
 * The holiday a new game keeps as its kidsHoliday: only a kids game's, only a real pack with kids'
 * questions in this language, and only in that holiday's season. Anything else a client sends is dropped.
 */
export function kidsHolidayFor(pack: string | undefined, locale: string, asked: any, now: number = Date.now()): string | undefined {
    return pack === KIDS_PACK && typeof asked === 'string' && kidsSeasonPack(now, locale, asked) === asked ? asked : undefined;
}
