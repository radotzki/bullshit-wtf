import { Injectable } from '@angular/core';
import { StoryLie, countLine, storyBadges, storyWords, wrapLines } from '../components/share-results/story-card';

export interface CardPlayer {
    nickname: string;
    score: number;
    picture: string; // file name under /assets
    place?: number;  // ties share a place
    me?: boolean;    // this phone's player, when known by player id
    best?: { text: string; fooled: number; q?: string }; // the player's best lie, when it fooled someone
    biggest?: boolean; // BIGGEST BULLSHITTER (the story card's badge)
    funniest?: { text: string; laughs: number; q?: string }; // wrote the game's FUNNIEST LIE
}

const SIZE = 1080;
/** The story card: 9:16, the size of an Instagram story or WhatsApp Status. */
const STORY_W = 1080;
const STORY_H = 1920;
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

    /**
     * Draws the tall story card of one player's best lie: the game's name big, the question with its
     * blank, the lie, how many friends it fooled, the badges it won, and "play with your friends".
     * Only the sharer's own lie and counts: no names, no avatars.
     */
    async renderStory(lie: StoryLie, locale: string): Promise<Blob> {
        const he = locale === 'he';
        const t = storyWords(locale);
        await this.loadFonts();

        const canvas = document.createElement('canvas');
        canvas.width = STORY_W;
        canvas.height = STORY_H;
        const ctx = canvas.getContext('2d');
        const cx = STORY_W / 2;
        const setDir = (rtl: boolean) => (ctx as any).direction = rtl ? 'rtl' : 'ltr';
        const sized = (text: string, px: number, maxW: number, min = 24) => {
            ctx.font = `${px}px ${FONT}`;
            while (px > min && ctx.measureText(text).width > maxW) {
                px -= 4;
                ctx.font = `${px}px ${FONT}`;
            }
            return px;
        };

        // Background: the game's orange, a little darker at the bottom.
        const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
        bg.addColorStop(0, '#e2805f');
        bg.addColorStop(1, '#c95f40');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, STORY_W, STORY_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        setDir(he);

        // The game's name, big. A story's top ~250px sit under the app's own bar, so it starts below.
        const nameSize = sized(t.name, he ? 230 : 150, STORY_W - 120);
        const nameY = 360;
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillText(t.name, cx + 7, nameY + 7);
        ctx.fillStyle = '#fff';
        ctx.fillText(t.name, cx, nameY);
        sized(t.tagline, 44, STORY_W - 160);
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fillText(t.tagline, cx, nameY + nameSize * 0.5 + 60);

        // Badges, as pills.
        const badges = storyBadges(lie, locale);
        let y = nameY + nameSize * 0.5 + 170;
        if (badges.length) {
            ctx.font = `44px ${FONT}`;
            const pad = 34;
            const gap = 24;
            const widths = badges.map(b => ctx.measureText(b).width + pad * 2);
            const total = widths.reduce((a, b) => a + b, 0) + gap * (badges.length - 1);
            const scale = Math.min(1, (STORY_W - 100) / total);
            ctx.font = `${Math.floor(44 * scale)}px ${FONT}`;
            let x = cx - (total * scale) / 2;
            // Right to left in Hebrew: the first badge on the right.
            const order = he ? badges.slice().reverse() : badges;
            const ws = he ? widths.slice().reverse() : widths;
            order.forEach((b, i) => {
                const w = ws[i] * scale;
                this.roundRect(ctx, x, y - 42 * scale, w, 84 * scale, 42 * scale);
                ctx.fillStyle = DARK;
                ctx.fill();
                ctx.fillStyle = '#ffd34d';
                ctx.fillText(b, x + w / 2, y + 3);
                x += w + gap * scale;
            });
            y += 90;
        } else {
            y += 20;
        }

        // The white card: heading, question, the lie, the count. Measured first, then drawn.
        const cardX = 70;
        const cardW = STORY_W - 2 * cardX;
        const inner = cardW - 120;
        const measureWith = (px: number) => (s: string) => {
            ctx.font = `${px}px ${FONT}`;
            return ctx.measureText(s).width;
        };
        let qSize = 54;
        let qLines = lie.question ? wrapLines(lie.question, inner, measureWith(qSize), 6) : [];
        while (qLines.length > 4 && qSize > 40) {
            qSize -= 4;
            qLines = wrapLines(lie.question, inner, measureWith(qSize), 6);
        }
        const quoted = `"${lie.lie}"`;
        let lieSize = 96;
        let lieLines = wrapLines(quoted, inner, measureWith(lieSize), 4);
        while (lieLines.length > 2 && lieSize > 60) {
            lieSize -= 6;
            lieLines = wrapLines(quoted, inner, measureWith(lieSize), 4);
        }
        const count = countLine(lie, locale);
        const headH = 60;
        const qH = qLines.length ? qLines.length * qSize * 1.25 + 40 : 0;
        const lieH = lieLines.length * lieSize * 1.15;
        const countH = 110;
        const cardH = 70 + headH + qH + lieH + countH + 50;
        const cardY = Math.max(y + 20, Math.min(1500 - cardH, 1010 - cardH / 2));

        ctx.fillStyle = 'rgba(0,0,0,.16)';
        this.roundRect(ctx, cardX + 10, cardY + 14, cardW, cardH, 44);
        ctx.fill();
        ctx.fillStyle = '#fff';
        this.roundRect(ctx, cardX, cardY, cardW, cardH, 44);
        ctx.fill();

        let cy = cardY + 70 + headH / 2;
        sized(t.heading, 44, inner);
        ctx.fillStyle = GREY;
        ctx.fillText(t.heading, cx, cy);
        cy += headH / 2 + 30;

        if (qLines.length) {
            ctx.font = `${qSize}px ${FONT}`;
            ctx.fillStyle = DARK;
            qLines.forEach(line => {
                cy += qSize * 0.625;
                ctx.fillText(line, cx, cy);
                cy += qSize * 0.625;
            });
            cy += 40;
        }

        ctx.font = `${lieSize}px ${FONT}`;
        ctx.fillStyle = PRIMARY;
        lieLines.forEach(line => {
            cy += lieSize * 0.575;
            ctx.fillText(line, cx, cy);
            cy += lieSize * 0.575;
        });

        cy += countH / 2 + 10;
        sized(count, 64, inner);
        ctx.fillStyle = DARK;
        ctx.fillText(count, cx, cy);

        // The call to action, above the story's bottom bar.
        const playY = Math.max(cardY + cardH + 110, 1600);
        sized(t.play, 72, STORY_W - 140);
        ctx.fillStyle = '#fff';
        ctx.fillText(t.play, cx, playY);
        setDir(false);
        ctx.font = `60px ${FONT}`;
        const siteW = ctx.measureText(t.site).width + 90;
        this.roundRect(ctx, cx - siteW / 2, playY + 60, siteW, 100, 50);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.fillStyle = PRIMARY;
        ctx.fillText(t.site, cx, playY + 113);

        return new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not draw the story card')), 'image/png')
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
