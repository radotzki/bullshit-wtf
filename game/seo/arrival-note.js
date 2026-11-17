// Where a visit started, for a game the visitor goes on to create: the same note, under the same key
// and in the same shape, as the app keeps at start-up (src/app/services/arrival.ts). A page built
// outside the app (the search pages by build-pages.js, the daily puzzle by daily-page.js) is often the
// first page of a visit, and only that page sees the site the visitor came from. It keeps the page's
// path and the referring site's host name for this tab: never a full address or a query.
// Every such page writes this one script into its <head>, so it runs before any button is on screen.
'use strict';

const ARRIVAL_NOTE = `<script>
    (function () {
      try {
        var s = window.sessionStorage;
        if (s.getItem('BS_ARRIVAL')) return;
        var m = /^[a-z][a-z0-9+.-]*:\\/\\/([^\\/?#]*)/i.exec(document.referrer || '');
        var h = m ? m[1].replace(/^[^@]*@/, '').replace(/:\\d*$/, '').toLowerCase() : '';
        if (h && h === location.hostname) return;
        s.setItem('BS_ARRIVAL', JSON.stringify({
          page: location.pathname.slice(0, 80), ref: /^[a-z0-9.-]{1,60}$/.test(h) ? h : null, at: new Date().getTime()
        }));
      } catch (e) { }
    })();
  </script>`;

module.exports = { ARRIVAL_NOTE };
