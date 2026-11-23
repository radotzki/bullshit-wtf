// Every probe set of the kids' filter break-in and of Product's four looks at #226 (reports:
// kids-filter-break-in, kids-filter-226-check), in one place, so a change to the filter is checked against
// all of them at once: each fix in that pull request first reopened something the last one had closed.
//   npm run build && node --test test/lie-filter-probes.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { lieRefused, LIE_WORDS } = require(path.join(__dirname, '..', 'dist', 'controllers', 'lie-filter'));
const { nameFlag } = require(path.join(__dirname, '..', 'dist', 'name-flag'));
const probes = require(path.join(__dirname, 'lie-filter-probes.json'));

for (const set of Object.keys(probes.lies)) {
    test('probes: ' + set, () => {
        assert.deepStrictEqual(probes.lies[set].refused.filter(t => !lieRefused(t)), [], 'let through');
        assert.deepStrictEqual(probes.lies[set].fine.filter(t => lieRefused(t)), [], 'refused a fair lie');
    });
}

test('probes: nicknames', () => {
    assert.deepStrictEqual(probes.names.flagged.filter(n => !nameFlag(n)), [], 'kept a rude name');
    assert.deepStrictEqual(probes.names.kept.filter(n => !!nameFlag(n)), [], 'swapped a fair name');
});

// Product's third look: every listed English word spelled out with spaces, dots or dashes, also with each
// look-alike sign or digit in turn ("5 h i t", "n.1.g.g.e.r", "s-h-!-t"). A "!" that ends the whole lie
// still ends a word ("p.a.k.!" passes, as "Kush!" must), so those few are left out.
test('every listed English word spelled out, with look-alikes, is refused', () => {
    const look = { a: ['4', '@'], s: ['5', '$'], i: ['1', '!'], o: ['0'], e: ['3'], t: ['7'] };
    const forms = [];
    for (const w of LIE_WORDS.word.filter(x => /^[a-z]{3,}$/.test(x))) {
        for (const sep of [' ', '.', '-']) {
            forms.push(w.split('').join(sep));
            w.split('').forEach((c, i) => (look[c] || []).forEach(d => {
                const l = w.split('');
                l[i] = d;
                forms.push(l.join(sep));
            }));
        }
    }
    assert.ok(forms.length > 2500, forms.length + ' forms');
    assert.deepStrictEqual(forms.filter(f => !/!$/.test(f) && !lieRefused(f)), []);
});

// Product's second look: number answers. Decimals with words and signs, ranges, times, fractions, dates.
test('number forms with words and signs are fair', () => {
    const forms = [];
    for (let i = 0; i < 100; i++) for (let j = 0; j < 10; j++) {
        forms.push(i + '.' + j + ' million', i + '.' + j + ' מיליון', '$' + i + '.' + j, i + '.' + j + '%', i + ' ' + j);
    }
    for (let i = 0; i < 60; i++) for (let j = i + 1; j < i + 30; j++) forms.push(i + '-' + j + ' ימים', 'בין ' + i + '-' + j, i + '–' + j);
    for (let d = 1; d <= 31; d++) for (let m = 1; m <= 12; m++) forms.push(d + '.' + m + '.1999', d + '/' + m + '/23');
    for (let i = 0; i < 10000; i++) if (String(i).indexOf('1488') < 0) forms.push(i + ' שנים', 'בן ' + i);
    assert.deepStrictEqual(forms.filter(t => lieRefused(t)), []);
});

// Every string in the question files (true answers, suggested lies, prompts): none is refused as a lie.
test('no string in the question files is refused', () => {
    const dir = path.join(__dirname, '..', 'data');
    const strings = [];
    const walk = o => {
        if (typeof o === 'string') {
            if (o.length < 80) strings.push(o);
        } else if (Array.isArray(o)) {
            o.forEach(walk);
        } else if (o && typeof o === 'object') {
            Object.keys(o).forEach(k => walk(o[k]));
        }
    };
    fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
    assert.ok(strings.length > 3000, strings.length + ' strings');
    // "פאק" is a listed word that the Hebrew fixes file names on purpose.
    assert.deepStrictEqual(strings.filter(s => s !== 'פאק' && lieRefused(s)), []);
});
