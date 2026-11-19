/**
 * The demo clip on the home: 20 silent, looping seconds of one real round on a phone (the files are
 * in src/assets/demo, made by media/demo-clip in the project's files). Most new groups come from a
 * search that lands on the home, and the home described the game only in words and a small picture.
 *
 * The clip sits under the first screen, so it must cost the first screen nothing: the page asks for
 * neither the video nor its poster until the clip is near the viewport (watchClip), and a visitor
 * whose system asks for less motion gets the poster alone, still.
 *
 * Kept free of Angular so it can be tested in Node.
 */

export interface ClipStrings {
    lang: 'en' | 'he';
    /** The video file and its still, under /assets/demo. */
    src: string;
    poster: string;
    /** The line under the clip. */
    caption: string;
    /** Read out by a screen reader in place of the clip. */
    alt: string;
}

const clips: { en: ClipStrings; he: ClipStrings } = {
    en: {
        lang: 'en',
        src: '/assets/demo/demo-round-en.mp4',
        poster: '/assets/demo/demo-round-en-poster.jpg',
        caption: 'One real round, in 20 seconds: write a lie, find the truth, see who fell for it.',
        alt: 'A real round on the host\'s phone. Friends join, a strange true fact appears, '
            + 'everyone writes a lie, picks the answer they think is true, and the game reveals who fooled whom.',
    },
    he: {
        lang: 'he',
        src: '/assets/demo/demo-round-he.mp4',
        poster: '/assets/demo/demo-round-he-poster.jpg',
        caption: 'סיבוב אמיתי אחד ב־20 שניות: ממציאים שקר, מחפשים את האמת, מגלים מי נפל בפח.',
        alt: 'סיבוב אמיתי בטלפון של המארחת. החברים מצטרפים, מופיעה עובדה מוזרה ואמיתית, '
            + 'כל אחד ממציא שקר, בוחר את התשובה שנראית לו אמיתית, והמשחק מגלה מי עבד על מי.',
    },
};

export function clipStrings(locale: string): ClipStrings {
    return locale === 'he' ? clips.he : clips.en;
}

/** The clip loads once it is this close to the viewport (about one phone screen below it). */
export const CLIP_NEAR = '0px 0px 600px 0px';
/** The clip counts as seen once half of it is on the screen. */
export const CLIP_SEEN = 0.5;

/** The parts of the browser watchClip uses, so it can be tested without one. */
export interface ClipBrowser {
    reducedMotion(): boolean;
    /**
     * Calls back with true or false each time the element comes near (or goes away), as an
     * IntersectionObserver would; returns a stop. Null when the browser has none.
     */
    observe: ((el: any, margin: string, threshold: number, cb: (inside: boolean) => void) => () => void) | null;
}

export interface ClipVideo {
    muted: boolean;
    poster: string;
    src: string;
    loop: boolean;
    autoplay: boolean;
    paused: boolean;
    play(): Promise<void> | void;
    pause(): void;
    removeAttribute(name: string): void;
    setAttribute(name: string, value: string): void;
}

/**
 * Loads the clip once it is near the screen, plays it while it is on screen, and calls seen() the
 * first time half of it is in view. With reduced motion: the poster only, no video at all. A browser
 * with no IntersectionObserver loads it at once (the call is made after the first screen is drawn).
 * Returns a stop, for when the home goes away, and a way to change the language.
 */
export function watchClip(video: ClipVideo, box: any, clip: ClipStrings, browser: ClipBrowser, seen: () => void) {
    let current = clip;
    let loaded = false;
    let onScreen = false;
    let counted = false;
    const still = browser.reducedMotion();
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    function play() {
        if (still || !loaded || !onScreen) {
            return;
        }
        try {
            const p = video.play();
            if (p && typeof (p as any).catch === 'function') {
                (p as any).catch(() => null);
            }
        } catch (e) { }
    }

    function load() {
        loaded = true;
        video.poster = current.poster;
        if (still) {
            // The still alone: no video file is fetched.
            video.removeAttribute('src');
            return;
        }
        video.loop = true;
        video.src = current.src;
        play();
    }

    const stops: Array<() => void> = [];
    if (browser.observe) {
        stops.push(browser.observe(box, CLIP_NEAR, 0, inside => {
            if (inside && !loaded) {
                load();
            }
        }));
        stops.push(browser.observe(box, '0px', CLIP_SEEN, inside => {
            onScreen = inside;
            if (inside) {
                if (!counted) {
                    counted = true;
                    seen();
                }
                play();
            } else if (!still && loaded && !video.paused) {
                video.pause();
            }
        }));
    } else {
        onScreen = true;
        load();
    }

    return {
        stop() {
            stops.forEach(s => s());
            if (!still && loaded) {
                try { video.pause(); } catch (e) { }
            }
        },
        setClip(next: ClipStrings) {
            if (next.src === current.src) {
                return;
            }
            current = next;
            if (loaded) {
                load();
            }
        },
    };
}
