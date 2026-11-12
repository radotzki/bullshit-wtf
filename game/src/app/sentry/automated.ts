/**
 * This page is driven by an automated browser (Playwright, Puppeteer, Selenium and the like), not a player.
 *
 * Such runs against production used to fill Sentry: most users of its "Network Error" issue were
 * our own test runs, so its user counts did not count players. Browsers set `navigator.webdriver` to
 * true only when automation controls them, so a real player's errors are never dropped.
 */
export function isAutomatedBrowser(nav: { webdriver?: boolean } | undefined | null): boolean {
    try {
        return !!nav && nav.webdriver === true;
    } catch (e) {
        return false;
    }
}
