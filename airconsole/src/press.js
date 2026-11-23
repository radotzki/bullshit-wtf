// How a controller's buttons act, and how its commands (START, switch language, PLAY AGAIN) reach
// the screen. Both are made to work in AirConsole's own simulator, where START on the master phone
// did nothing (replay of 23 Nov 2026) while AirConsole's Pong demo started from its phone at once.
//
// Presses: a button acts when it is pressed down (pointerdown, or touchstart / mousedown where
// pointer events are missing), as AirConsole's own controllers (Pong) do, and not only on "click",
// which a phone frame inside AirConsole's pages may never receive. The press's default is stopped, so
// the button takes no focus and the frame keeps none. "click" stays as a fallback (a keyboard's Enter,
// or a click that came without a press); one press acts once.
//
// Commands: each goes twice, as an AirConsole message to the screen and in the controller's own
// custom device state, so one lost route is not a dead button. Each carries the game's PIN and a
// number, and the screen acts once per device and number, and only for its current game.

/** A click this soon after a press of the same button is that press's own click. */
export const CLICK_AFTER_PRESS_MS = 1000;

/**
 * Calls `act(button)` once per press of an element under `root` that matches `selector`.
 * Disabled buttons do nothing. `win` is the window (tests pass a stand-in).
 */
export function onPress(root, selector, act, win) {
    const w = win || window;
    let last = { el: null, at: 0 };
    const find = e => (e.target && e.target.closest ? e.target.closest(selector) : null);
    const press = e => {
        if (e.type === 'mousedown' && e.button !== 0) {
            return;
        }
        if (e.type === 'pointerdown' && e.button !== undefined && e.button !== 0) {
            return;
        }
        const b = find(e);
        if (!b || b.disabled) {
            return;
        }
        if (e.cancelable && e.preventDefault) {
            e.preventDefault();
        }
        last = { el: b, at: Date.now() };
        act(b);
    };
    if (typeof w.PointerEvent === 'function') {
        root.addEventListener('pointerdown', press);
    } else {
        root.addEventListener('touchstart', press, { passive: false });
        root.addEventListener('mousedown', press);
    }
    root.addEventListener('click', e => {
        const b = find(e);
        if (!b || b.disabled) {
            return;
        }
        if (last.el === b && Date.now() - last.at < CLICK_AFTER_PRESS_MS) {
            return;
        }
        // A press may have redrawn the button: a click on its new copy, right after, is the same press.
        if (last.el && Date.now() - last.at < CLICK_AFTER_PRESS_MS
            && last.el.getAttribute && b.getAttribute
            && last.el.getAttribute('data-do') === b.getAttribute('data-do')) {
            return;
        }
        last = { el: b, at: Date.now() };
        act(b);
    });
}

/**
 * The controller's next command: `type` for game `pin`. Its number grows with the clock (`now`, ms),
 * so a controller that reloads never repeats a number the screen has already seen.
 */
export function nextCommand(previous, type, pin, now) {
    const after = previous && typeof previous.n === 'number' ? previous.n + 1 : 1;
    return { type, pin, n: Math.max(after, Math.floor(now)) };
}

/**
 * The screen's check: true the first time it sees command `cmd` from device `from` for its game
 * `pin`, by either route; false for a repeat, another game's command or anything malformed.
 * `seen` is the screen's record (a plain object), updated here.
 */
export function acceptCommand(seen, from, cmd, pin) {
    if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string' || typeof cmd.n !== 'number') {
        return false;
    }
    if (!pin || cmd.pin !== pin) {
        return false;
    }
    const key = `${pin}:${from}`;
    if (typeof seen[key] === 'number' && cmd.n <= seen[key]) {
        return false;
    }
    seen[key] = cmd.n;
    return true;
}
