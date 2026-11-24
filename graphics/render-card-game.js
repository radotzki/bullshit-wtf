// Renders graphics/card-game.html into 1200x630 link previews. Usage: node graphics/render-card-game.js <assetsDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const assets = process.argv[2] || path.join(__dirname, '..', 'game', 'src', 'assets');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.join(__dirname, 'card-game.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  for (const id of ['card-game-en', 'card-game-he']) {
    await page.locator('#' + id).screenshot({ path: path.join(assets, 'og-' + id + '.png') });
  }
  await browser.close();
})();
