/**
 * Fades a big-screen track out over `ms`, then unloads it (stops it and frees its audio).
 *
 * The pages used to call `setTimeout(this.sound.stop, ms)`, which hands howler's `stop` over without
 * its track: it threw when the timer fired, and the track kept playing at volume zero, holding its
 * decoded audio, for the rest of the game (Sentry BULLSHIT-5R). Holding the track here also keeps
 * the timer off a newer track that a later `playMusic` puts in `this.sound`.
 */
export function fadeOutAndUnload(sound: { fade(from: number, to: number, ms: number): any; unload(): any }, ms = 1000) {
    sound.fade(1, 0, ms);
    setTimeout(() => sound.unload(), ms);
}
