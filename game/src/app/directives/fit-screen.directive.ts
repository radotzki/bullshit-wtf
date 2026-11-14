import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy } from '@angular/core';
import { fittingScale } from './fit-screen';

/**
 * On the big screen in the room, shrinks a whole page of the game until it fits the screen's height.
 * A TV can't scroll: with twelve players, or on a 720p TV, the last answers and the last players of
 * the final were below the bottom edge. `[appFitScreen]="presenter"` goes on the page's outer
 * section; on a phone (false) it does nothing, and the page scrolls as before.
 *
 * It scales with CSS `zoom`, which lays the page out again at the new scale: the page keeps the full
 * width of the screen, and only as much is taken off the text as the height needs. The page is looked
 * at again when its content changes (a player joins, the answers arrive, a picture or a font loads)
 * and when the window changes size. A browser without `zoom` keeps the page as it was.
 */
@Directive({
    standalone: false,
    selector: '[appFitScreen]'
})
export class FitScreenDirective implements OnChanges, OnDestroy {
    @Input('appFitScreen') on: boolean;

    private watching = false;
    private frame: number = null;
    private changes: MutationObserver;
    private readonly again = () => this.later();

    constructor(private el: ElementRef<HTMLElement>, private zone: NgZone) { }

    ngOnChanges() {
        if (this.on && !this.watching && supportsZoom()) {
            this.watch();
        } else if (!this.on && this.watching) {
            this.stop();
        }
    }

    ngOnDestroy() {
        this.stop();
    }

    private watch() {
        const host = this.el.nativeElement;
        this.watching = true;
        host.classList.add('fit-screen');
        // Outside Angular: a look changes nothing the templates show, so it needs no change detection.
        this.zone.runOutsideAngular(() => {
            // Not the style attribute: this directive writes it, and the clock's bar changes it all the time.
            this.changes = new MutationObserver(this.again);
            this.changes.observe(host, {
                childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'],
            });
            window.addEventListener('resize', this.again);
            // A picture's load doesn't bubble: listen on the way down.
            host.addEventListener('load', this.again, true);
            const fonts = (document as any).fonts;
            if (fonts && fonts.addEventListener) {
                fonts.addEventListener('loadingdone', this.again);
            }
            this.later();
        });
    }

    private stop() {
        if (!this.watching) {
            return;
        }
        const host = this.el.nativeElement;
        this.watching = false;
        this.changes.disconnect();
        window.removeEventListener('resize', this.again);
        host.removeEventListener('load', this.again, true);
        const fonts = (document as any).fonts;
        if (fonts && fonts.removeEventListener) {
            fonts.removeEventListener('loadingdone', this.again);
        }
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        host.classList.remove('fit-screen');
        host.style.removeProperty('zoom');
        host.removeAttribute('data-fit');
    }

    /** Many changes in one go (a list of answers arriving) are one look, before the next paint. */
    private later() {
        if (this.frame === null) {
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                this.fit();
            });
        }
    }

    private fit() {
        if (!this.watching) {
            return;
        }
        const host = this.el.nativeElement;
        const scale = fittingScale((s) => {
            host.style.setProperty('zoom', String(s));
            // The section is as tall as the screen and hides what overflows it (.fit-screen): its
            // content is taller than itself exactly when something is cut. One pixel for rounding.
            return host.scrollHeight <= host.clientHeight + 1;
        });
        host.style.setProperty('zoom', String(scale));
        // For the play-test (.github/smoke/tv-fit.js): the scale this page is drawn at.
        host.setAttribute('data-fit', String(scale));
    }
}

function supportsZoom(): boolean {
    return typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('zoom', '0.5');
}
