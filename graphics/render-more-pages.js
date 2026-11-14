// Renders graphics/more-pages.html into 1200x630 link previews: og-<id>.png for each card.
// Usage: node graphics/render-more-pages.js <assetsDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const assets = process.argv[2] || path.join(__dirname, '..', 'game', 'src', 'assets');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.join(__dirname, 'more-pages.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const ids = await page.$$eval('.card', cards => cards.map(c => c.id));
  for (const id of ids) {
    await page.locator('#' + id).screenshot({ path: path.join(assets, 'og-' + id + '.png') });
  }
  await browser.close();
  console.log('Wrote ' + ids.length + ' images to ' + assets);
})();
