// Renders graphics/hanukkah.html into PNGs. Usage: node graphics/render-hanukkah.js <assetsDir> <postsDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [assets, posts] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.join(__dirname, 'hanukkah.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const shots = { 'og-en': [assets, 'og-hanukkah-en.png'], 'og-he': [assets, 'og-hanukkah-he.png'],
    'post-he': [posts, 'hanukkah-post-he.png'], 'post-en': [posts, 'hanukkah-post-en.png'], 'story-he': [posts, 'hanukkah-story-he.png'] };
  for (const id of Object.keys(shots)) {
    await page.locator('#' + id).screenshot({ path: path.join(shots[id][0], shots[id][1]) });
  }
  await browser.close();
})();
