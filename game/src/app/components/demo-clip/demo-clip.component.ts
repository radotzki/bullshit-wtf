import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { markVisit } from '../../services/join-source';
import { ClipBrowser, ClipStrings, clipStrings, watchClip } from './demo-clip';

/** The nearest ancestor that scrolls up and down, or null for the viewport. */
function scroller(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const y = getComputedStyle(p).overflowY;
        if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) {
            return p;
        }
    }
    return null;
}

/** The browser's side of watchClip: reduced motion and IntersectionObserver. */
const browser: ClipBrowser = {
    reducedMotion() {
        try {
            return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) {
            return false;
        }
    },
    observe: typeof window !== 'undefined' && 'IntersectionObserver' in window
        ? (el, margin, threshold, cb) => {
            // The computer home scrolls inside its own box, not the window: a margin counts only on
            // the root, so the root is the nearest box that scrolls (else the viewport).
            const io = new IntersectionObserver(entries => {
                const e = entries[entries.length - 1];
                cb(e.isIntersecting && e.intersectionRatio >= threshold);
            }, { root: scroller(el), rootMargin: margin, threshold });
            io.observe(el);
            return () => io.disconnect();
        }
        : null,
};

/**
 * The demo clip of one real round, under the home's first screen (demo-clip.ts). Nothing of it
 * loads until it is near the screen; the first time half of it is in view, the visit beacon sends
 * one row of kind 'clip' (BigQuery analytics.visits), so visits that saw it can be told apart.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-demo-clip',
    template: `
        <figure class="demo-clip" [attr.lang]="c.lang" [attr.dir]="c.lang === 'he' ? 'rtl' : 'ltr'">
            <div class="frame" #box>
                <video #video muted playsinline preload="none" width="360" height="659" disablepictureinpicture
                    [attr.aria-label]="c.alt"></video>
            </div>
            <figcaption>{{ c.caption }}</figcaption>
        </figure>
    `,
    styles: [`
        :host { display: block; flex: none; width: 100%; }
        .demo-clip { margin: 24px auto 16px; padding: 0 16px; max-width: 392px; text-align: center; }
        .frame { width: 100%; aspect-ratio: 720 / 1318; border-radius: 22px; overflow: hidden; background: #fff;
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.18); }
        video { display: block; width: 100%; height: 100%; object-fit: cover; }
        figcaption { margin-top: 10px; font-size: 15px; line-height: 1.35; color: inherit; }
    `],
})
export class DemoClipComponent implements AfterViewInit, OnChanges, OnDestroy {
    /** The home's language: en or he. */
    @Input() lang = 'en';
    c: ClipStrings = clipStrings('en');
    @ViewChild('video') video: ElementRef<HTMLVideoElement>;
    @ViewChild('box') box: ElementRef<HTMLElement>;
    private watch: ReturnType<typeof watchClip> | null = null;

    ngOnChanges() {
        this.c = clipStrings(this.lang);
        if (this.watch) {
            this.watch.setClip(this.c);
        }
    }

    ngAfterViewInit() {
        this.watch = watchClip(this.video.nativeElement as any, this.box.nativeElement, this.c, browser, () => markVisit('clip'));
    }

    ngOnDestroy() {
        if (this.watch) {
            this.watch.stop();
        }
    }
}
