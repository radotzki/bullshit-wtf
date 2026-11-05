import { Component, Input, OnChanges } from '@angular/core';
import * as qrcode from 'qrcode-generator';

/**
 * Renders a QR code as plain SVG rects, so there is no canvas or innerHTML involved.
 */
@Component({
    selector: 'app-qr-code',
    template: `
        <svg *ngIf="size" class="qr-code" [attr.viewBox]="viewBox" shape-rendering="crispEdges"
             role="img" [attr.aria-label]="label">
            <rect [attr.width]="size + 2 * margin" [attr.height]="size + 2 * margin" fill="#fff"></rect>
            <path [attr.d]="path" fill="#363636"></path>
        </svg>
    `,
    styles: [`
        :host { display: block; }
        .qr-code { display: block; width: 100%; height: 100%; }
    `],
})
export class QrCodeComponent implements OnChanges {
    @Input() data: string;
    @Input() label = 'QR code';
    margin = 2;
    size: number;
    path: string;
    viewBox: string;

    ngOnChanges() {
        if (!this.data) {
            this.size = 0;
            return;
        }

        const qr = qrcode(0, 'M');
        qr.addData(this.data);
        qr.make();

        const count = qr.getModuleCount();
        const parts: string[] = [];

        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(row, col)) {
                    parts.push(`M${col + this.margin},${row + this.margin}h1v1h-1z`);
                }
            }
        }

        this.size = count;
        this.path = parts.join('');
        this.viewBox = `0 0 ${count + 2 * this.margin} ${count + 2 * this.margin}`;
    }
}
