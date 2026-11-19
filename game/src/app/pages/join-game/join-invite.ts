/**
 * Who invited a guest, for the line above the nickname box ("Dana invited you to Bullshit, a
 * 10-minute lying game."). The same host and the same name rules as the join link's own preview
 * (functions: controllers/join-preview.ts, hostOf and shownName), so the page never names someone
 * the preview would not: the seat the server marked as host, else the creator's own seat; a name the
 * nickname filter flags, or a swap name, is not shown, and the line goes nameless.
 * Kept free of Angular so it can be tested in Node.
 */
import { GamePlayers } from '../../game-model';
import { nameFlag, NICKNAME_MAX, SWAP_NAMES } from '../../name-flag';

const SWAPS: { [lower: string]: boolean } = {};
[].concat((SWAP_NAMES && SWAP_NAMES.en) || [], (SWAP_NAMES && SWAP_NAMES.he) || [])
    .forEach((n: string) => SWAPS[String(n).trim().toLowerCase()] = true);

// Control characters, and the invisible ones that turn text around (bidi overrides and isolates).
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** The host's nickname as the invite line may show it, or '' for a nameless line. */
export function inviteHost(players: GamePlayers | null | undefined, creator?: string | null): string {
    const all = players && typeof players === 'object' ? players : {};
    const seats = Object.keys(all).filter(k => all[k] && typeof all[k] === 'object').sort();
    const marked = seats.filter(k => all[k].host === true).pop();
    const own = !marked && creator ? seats.filter(k => all[k].uid === creator).pop() : undefined;
    const seat = marked || own;
    const nickname = seat ? all[seat].nickname : undefined;
    if (typeof nickname !== 'string') {
        return '';
    }
    const name = Array.from(nickname.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()).slice(0, NICKNAME_MAX).join('').trim();
    if (!name || nameFlag(nickname) || nameFlag(name) || SWAPS[name.toLowerCase()]) {
        return '';
    }
    return /[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ֐-׿؀-ۿ]/.test(name) ? name : '';
}
