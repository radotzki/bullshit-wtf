import { Injectable } from '@angular/core';

export interface CardPlayer {
    nickname: string;
    score: number;
    picture: string; // file name under /assets
    place?: number;  // ties share a place
    me?: boolean;    // this phone's player, when known by player id
    best?: { text: string; fooled: number }; // the player's best lie, when it fooled someone
}

const SIZE = 1080;
const PRIMARY = '#db7151';
const DARK = '#363636';
const GREY = '#7a7a7a';
const LIGHT = '#f5f5f5';
const FONT = '"Luckiest Guy", "Suez One", "Arial Black", sans-serif';

const labels = {
    en: { heading: 'FINAL SCORES', hanukkah: 'HANUKKAH FINAL SCORES', you: 'YOU', footer: 'PLAY FREE AT BULLSHIT.WTF',
        fooled: (n: number) => `fooled ${n}` },
    he: { heading: 'תוצאות סופיות', hanukkah: 'תוצאות סופיות · חנוכה', you: 'אני', footer: 'שחקו בחינם ב-BULLSHIT.WTF',
        fooled: (n: number) => `נפלו בזה: ${n}` },
};

/**
 * Draws a square, shareable picture of the final scoreboard.
 * Square works well in WhatsApp, Instagram stories and X.
 */
@Injectable()
export class ResultsCardService {

    async render(players: CardPlayer[], me: string, locale: string, pack?: string, myIndex?: number): Promise<Blob> {
        const t = labels[locale === 'he' ? 'he' : 'en'];
        await this.loadFonts();
        const avatars = await Promise.all(players.map(p => this.loadImage(`/assets/${p.picture}`)));

        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Top band with the logo word
        ctx.fillStyle = PRIMARY;
        ctx.fillRect(0, 0, SIZE, 210);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `150px ${FONT}`;
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillText('BULLSHIT', SIZE / 2 + 6, 118);
        ctx.fillStyle = '#fff';
        ctx.fillText('BULLSHIT', SIZE / 2, 112);

        // Heading
        ctx.font = `54px ${FONT}`;
        ctx.fillStyle = GREY;
        (ctx as any).direction = locale === 'he' ? 'rtl' : 'ltr';
        ctx.fillText(pack === 'hanukkah' ? t.hanukkah : t.heading, SIZE / 2, 270);
        (ctx as any).direction = 'ltr';

        // Rows
        const top = 320;
        const bottom = 960;
        const rows = Math.max(players.length, 4);
        const gap = 12;
        const rowH = Math.min(110, (bottom - top - gap * (rows - 1)) / rows);
        const left = 80;
        const width = SIZE - 2 * left;

        players.forEach((p, i) => {
            const y = top + i * (rowH + gap);
            const isMe = typeof myIndex === 'number' ? i === myIndex : !!me && (p.nickname || '').toLowerCase() === me.toLowerCase();
            const place = p.place || i + 1;
            const isWinner = place === 1;
            // The best lie goes under the name when the rows are tall enough to read it.
            const lie = rowH >= 90 && p.best && p.best.text && p.best.fooled ? p.best : null;

            this.roundRect(ctx, left, y, width, rowH, 18);
            ctx.fillStyle = isWinner ? '#fdf1ec' : LIGHT;
            ctx.fill();
            if (isMe) {
                ctx.lineWidth = 6;
                ctx.strokeStyle = PRIMARY;
                ctx.stroke();
            }

            const cy = y + rowH / 2;
            ctx.textBaseline = 'middle';

            // Rank
            ctx.textAlign = 'center';
            ctx.font = `${Math.round(rowH * 0.5)}px ${FONT}`;
            ctx.fillStyle = isWinner ? PRIMARY : GREY;
            ctx.fillText(`${place}`, left + 50, cy + 3);

            // Avatar
            const avatar = avatars[i];
            const ah = rowH - 16;
            if (avatar) {
                const aw = ah * (avatar.width / avatar.height);
                ctx.drawImage(avatar, left + 100, y + 8, aw, ah);
            }

            // Name
            ctx.textAlign = 'left';
            ctx.font = `${Math.round(rowH * 0.42)}px ${FONT}`;
            ctx.fillStyle = DARK;
            const name = (p.nickname || '').toUpperCase();
            const nameY = lie ? y + rowH * 0.36 : cy + 3;
            ctx.fillText(name, left + 120 + ah, nameY);

            if (isMe) {
                const nameW = ctx.measureText(name).width;
                ctx.font = `${Math.round(rowH * 0.26)}px ${FONT}`;
                ctx.fillStyle = PRIMARY;
                ctx.fillText(`(${t.you})`, left + 135 + ah + nameW, nameY);
            }

            if (lie) {
                const maxW = width - 120 - ah - 200;
                ctx.font = `${Math.round(rowH * 0.24)}px ${FONT}`;
                ctx.fillStyle = GREY;
                const fooled = t.fooled(lie.fooled);
                let text = lie.text.toUpperCase();
                let quote = `"${text}" · ${fooled}`;
                while (text.length > 1 && ctx.measureText(quote).width > maxW) {
                    text = text.slice(0, -1);
                    quote = `"${text.trim()}…" · ${fooled}`;
                }
                // The row runs left to right in both languages, so the lie starts under the name;
                // rtl keeps Hebrew words and numbers in order.
                (ctx as any).direction = locale === 'he' ? 'rtl' : 'ltr';
                ctx.textAlign = 'left';
                ctx.fillText(quote, left + 120 + ah, y + rowH * 0.74);
                (ctx as any).direction = 'ltr';
                ctx.textAlign = 'left';
            }

            // Score
            ctx.textAlign = 'right';
            ctx.font = `${Math.round(rowH * 0.42)}px ${FONT}`;
            ctx.fillStyle = isWinner ? PRIMARY : DARK;
            ctx.fillText(`${p.score || 0}`, left + width - 30, cy + 3);
        });

        // Footer call to action
        ctx.textAlign = 'center';
        ctx.font = `46px ${FONT}`;
        ctx.fillStyle = PRIMARY;
        (ctx as any).direction = locale === 'he' ? 'rtl' : 'ltr';
        ctx.fillText(t.footer, SIZE / 2, 1020);

        return new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not draw results')), 'image/png')
        );
    }

    private async loadFonts() {
        const fonts = (document as any).fonts;
        if (fonts && fonts.load) {
            try {
                await Promise.all([
                    fonts.load(`60px "Luckiest Guy"`, 'BULLSHIT'),
                    fonts.load(`60px "Suez One"`, 'בולשיט'),
                ]);
            } catch (e) { }
        }
    }

    private loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(undefined);
            img.src = src;
        });
    }

    private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
