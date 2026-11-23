// A local stand-in for AirConsole's platform, for the tests (airconsole/test/simulated-game.js).
// AirConsole's own simulator (www.airconsole.com/simulator) runs the game in frames under its page and
// talks to it with window.postMessage. This page does the same with the messages AirConsole's API
// 1.11.0 sends and handles (its onPostMessage_): "ready", "message", "set" (custom, players, ad) and
// "update" for connects, disconnects and device states. It is a test double, not AirConsole: it
// proves the game against the API's code, not against AirConsole's servers.
//
// Query: ?screen=<url of screen.html>&controllers=<url>,<url>,...&lang=en|he&names=Ana,Ben,...
// Each controller may come from its own origin (another port), so each has its own storage and its
// own Firebase sign-in, as phones do.

(function () {
    'use strict';

    const q = new URLSearchParams(location.search);
    const lang = q.get('lang') || 'en';
    const names = (q.get('names') || 'Ana,Ben,Cleo,Dov,Eli,Fay').split(',');
    const devices = [];   // device_id -> { frame, url, data, loaded }
    const log = [];
    window.harnessLog = log;

    function gameUrl(url) {
        // As the API's getGameUrl_: no query or hash, no screen.html / controller.html, http.
        let u = url.split('#')[0].split('?')[0];
        u = u.replace(/(screen|controller)\.html$/, '');
        return u.replace(/^https:\/\//, 'http://');
    }

    /** Device `id` as device `viewer` sees it: every loaded device sits at the viewer's own game URL. */
    function view(id, viewer) {
        const d = devices[id];
        if (!d || !d.loaded) {
            return d ? Object.assign({}, d.data, { location: null }) : null;
        }
        const base = gameUrl(devices[viewer].url);
        return Object.assign({}, d.data, { location: base + (id === 0 ? 'screen.html' : 'controller.html') });
    }

    function post(id, message) {
        const d = devices[id];
        if (d && d.loaded && d.frame.contentWindow) {
            d.frame.contentWindow.postMessage(message, '*');
        }
    }

    function updateAll(id, extra) {
        devices.forEach((d, viewer) => {
            if (viewer !== id && d && d.loaded) {
                post(viewer, { action: 'update', device_id: id, device_data: Object.assign(view(id, viewer) || {}, extra || {}) });
            }
        });
    }

    function add(kind, url, nickname) {
        const id = devices.length;
        const frame = document.createElement('iframe');
        frame.name = kind === 'screen' ? 'screen' : `controller-${id}`;
        frame.src = url;
        const box = document.createElement('div');
        box.className = `device ${kind}`;
        const label = document.createElement('span');
        label.textContent = kind === 'screen' ? 'screen (device 0)' : `${nickname} (device ${id})`;
        box.appendChild(label);
        box.appendChild(frame);
        document.getElementById(kind === 'screen' ? 'screen-row' : 'controller-row').appendChild(box);
        devices.push({
            frame, url, box, loaded: false,
            data: {
                uid: `harness-uid-${id}`,
                nickname: kind === 'screen' ? undefined : nickname,
                language: lang,
                premium: false,
                client: { app: 'web' },
                custom: undefined,
            },
        });
        return id;
    }

    /** A controller leaves (its phone closed AirConsole): the others get the disconnect. */
    function drop(id) {
        const d = devices[id];
        if (!d || !d.loaded) {
            return false;
        }
        d.loaded = false;
        updateAll(id);
        d.box.remove();
        log.push(`drop ${id}`);
        return true;
    }

    window.addEventListener('message', event => {
        const id = devices.findIndex(d => d && d.frame.contentWindow === event.source);
        const data = event.data;
        if (id < 0 || !data || typeof data !== 'object') {
            return;
        }
        if (data.action === 'ready') {
            devices[id].loaded = true;
            log.push(`ready ${id}`);
            post(id, {
                action: 'ready',
                device_id: id,
                code: '424242',
                devices: devices.map((d, i) => view(i, id)),
            });
            updateAll(id);
        } else if (data.action === 'message') {
            const to = data.to === undefined || data.to === null ? null : data.to;
            devices.forEach((d, i) => {
                if (i !== id && (to === null || to === i)) {
                    post(i, { action: 'message', from: id, data: data.data });
                }
            });
            log.push(`message ${id} -> ${to === null ? 'all' : to} ${JSON.stringify(data.data).slice(0, 80)}`);
        } else if (data.action === 'set') {
            if (data.key === 'custom') {
                devices[id].data.custom = data.value;
                updateAll(id, { _is_custom_update: true });
            } else if (data.key === 'players') {
                devices[id].data.players = data.value;
                updateAll(id, { _is_players_update: true });
            } else if (data.key === 'ad') {
                log.push(`ad by ${id}`);
                devices.forEach((d, i) => post(i, { action: 'ad' }));
                setTimeout(() => devices.forEach((d, i) => post(i, { action: 'ad', complete: false })), 300);
            }
        }
    });

    window.harness = {
        devices,
        drop,
        addController(url, nickname) {
            return add('controller', url, nickname);
        },
    };

    add('screen', q.get('screen'));
    (q.get('controllers') || '').split(',').filter(Boolean).forEach((url, i) => add('controller', url, names[i] || `Guest ${i + 1}`));
})();
