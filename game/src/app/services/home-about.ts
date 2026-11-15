/**
 * Where the text about the game (index.html and he.html, between the BS:ABOUT markers) shows:
 * under the home menu only. The home address (/ or /he) moves on to the phone menu (/m) or the
 * desktop menu (/d); the desktop menu covers the first screen, so the text starts below it there.
 * Every other screen (join, lobby, a game, a crew) hides it.
 * Kept free of Angular so it can be tested in Node (test/home-about.test.js).
 */
export function aboutPlace(url: string): 'm' | 'd' | 'home' | null {
    const path = String(url || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (path === '/m') {
        return 'm';
    }
    if (path === '/d') {
        return 'd';
    }
    return path === '/' || path === '/he' ? 'home' : null;
}
