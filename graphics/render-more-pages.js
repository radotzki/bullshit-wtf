// Renders graphics/more-pages.html into 1200x630 link previews: og-<id>.png for each card.
// Usage: node graphics/render-more-pages.js <assetsDir> [cards.html]
// The cards file defaults to graphics/more-pages.html; graphics/groups-home.html has the weekly-group
// and home-together pages' cards.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const assets = process.argv[2] || path.join(__dirname, '..', 'game', 'src', 'assets');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.resolve(process.argv[3] || path.join(__dirname, 'more-pages.html')));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const ids = await page.$$eval('.card', cards => cards.map(c => c.id));
  for (const id of ids) {
    await page.locator('#' + id).screenshot({ path: path.join(assets, 'og-' + id + '.png') });
  }
  await browser.close();
  console.log('Wrote ' + ids.length + ' images to ' + assets);
})();
