// The controller's own keyboard. AirConsole asks games not to use the phone's keyboard for text
// input; its sample keyboard (github.com/AirConsole/airconsole-keyboard) has no licence and no
// Hebrew, so the game draws its own: English and Hebrew letters, digits and a few signs.
// Typing builds plain text in a <div>; no <input> ever gets focus, so the phone's keyboard never opens.

export const MAX_LIE = 40;

export const LAYOUTS = {
    en: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '\''],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '.', '?'],
    ],
    // The Israeli standard layout, with the final letters where Hebrew keyboards keep them.
    he: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ', '-', '?'],
        ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
        ['ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ', '.'],
    ],
};

/** The text after one key: a character added (up to MAX_LIE), or the last one taken away. */
export function typed(text, key) {
    const chars = Array.from(text || '');
    if (key === 'backspace') {
        chars.pop();
        return chars.join('');
    }
    if (key === ' ' && (!chars.length || chars[chars.length - 1] === ' ')) {
        return chars.join(''); // no space first, and never two in a row
    }
    if (chars.length >= MAX_LIE) {
        return chars.join('');
    }
    return chars.join('') + key;
}

/**
 * Draws the keyboard into `container`. `onChange(text)` after each key. `layout` is 'en' or 'he';
 * the switch key flips it. Returns { setText, clear, layout(name) }.
 */
export function keyboard(container, opts) {
    let text = '';
    let layout = opts.layout === 'he' ? 'he' : 'en';

    function key(label, value, cls) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.setAttribute('data-key', value);
        return b;
    }

    function draw() {
        container.innerHTML = '';
        container.setAttribute('dir', 'ltr'); // keys keep their places in both languages
        LAYOUTS[layout].forEach(row => {
            const r = document.createElement('div');
            r.className = 'key-row';
            row.forEach(k => r.appendChild(key(k, k)));
            container.appendChild(r);
        });
        const last = document.createElement('div');
        last.className = 'key-row';
        last.appendChild(key(layout === 'he' ? opts.t.keyboardLetters : opts.t.keyboardHebrew, 'switch', 'key-wide'));
        last.appendChild(key(opts.t.space, ' ', 'key-space'));
        last.appendChild(key('⌫', 'backspace', 'key-wide'));
        container.appendChild(last);
    }

    container.addEventListener('pointerdown', e => {
        const b = e.target.closest && e.target.closest('[data-key]');
        if (!b) {
            return;
        }
        e.preventDefault();
        const value = b.getAttribute('data-key');
        if (value === 'switch') {
            layout = layout === 'he' ? 'en' : 'he';
            draw();
            return;
        }
        text = typed(text, value);
        opts.onChange(text);
    });

    draw();
    return {
        setText(v) { text = v || ''; opts.onChange(text); },
        clear() { text = ''; opts.onChange(text); },
        layout(name) { layout = name === 'he' ? 'he' : 'en'; draw(); },
        text() { return text; },
    };
}
