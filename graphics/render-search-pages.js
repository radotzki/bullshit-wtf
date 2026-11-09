// Renders graphics/search-pages.html into 1200x630 link previews. Usage: node graphics/render-search-pages.js <assetsDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const assets = process.argv[2] || path.join(__dirname, '..', 'game', 'src', 'assets');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.join(__dirname, 'search-pages.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  for (const id of ['how-en', 'how-he', 'phone-en', 'phone-he', 'purim-en', 'purim-he']) {
    await page.locator('#' + id).screenshot({ path: path.join(assets, 'og-' + id + '.png') });
  }
  await browser.close();
})();
