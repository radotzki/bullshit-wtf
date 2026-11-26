// Renders graphics/hanukkah-party.html into the party page's link preview.
// Usage: node graphics/render-hanukkah-party.js <assetsDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [assets] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.join(__dirname, 'hanukkah-party.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.locator('#og-party-he').screenshot({ path: path.join(assets, 'og-hanukkah-party-he.png') });
  await browser.close();
})();
