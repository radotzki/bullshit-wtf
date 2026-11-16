/**
 * The release (the commit) this page was built from, for Sentry, so an error names the change that
 * was live when it happened.
 *
 * The build writes it into the page as <meta name="bs-release" content="<commit>">
 * (scripts/stamp-release.js, run after `ng build`). With no such tag, as on `ng serve`, or with
 * anything but a commit hash in it, this gives undefined and Sentry shows no release, as before.
 */
export function readRelease(doc: { querySelector(selector: string): any } | undefined | null): string | undefined {
    try {
        const tag = doc && doc.querySelector('meta[name="bs-release"]');
        const value = tag && tag.getAttribute('content');
        return typeof value === 'string' && /^[0-9a-f]{7,40}$/.test(value) ? value : undefined;
    } catch (e) {
        return undefined;
    }
}
