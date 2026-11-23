# AirConsole test build (not the live site)

This branch holds only a built copy of the AirConsole version (`airconsole/` in pull request #243,
commit c637fd3, the seat fix), so that AirConsole's simulator can load it from a public https address once
GitHub Pages serves this branch. Nothing here is deployed by a merge, and master never takes it.

One change from #243: games are tagged `test-airconsole`, a test campaign, so games played here are
left out of the weekly-player counts (the production build keeps `portal-airconsole`).

- Screen: `screen.html`, controllers: `controller.html`, both at the root.
- Simulator: `https://www.airconsole.com/simulator/#debug:https://radotzki.github.io/bullshit-wtf/`
- To rebuild: on c637fd3, set `AIRCONSOLE_TAG` in `airconsole/src/view.js` to `'test-airconsole'` and drop
  `|| isTestCampaign(AIRCONSOLE_TAG)` from the check below it, then `node build.js` and copy `airconsole/dist`
  here with an empty `.nojekyll`.
- To stop serving it: turn GitHub Pages off in the repository's settings, or delete this branch.
