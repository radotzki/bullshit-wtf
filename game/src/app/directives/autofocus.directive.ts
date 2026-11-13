import { Directive, ElementRef } from '@angular/core';

@Directive({
    standalone: false,
    selector: '[appAutofocus]'
})
export class AutofocusDirective {

    constructor(el: ElementRef) {
        setTimeout(() => el.nativeElement.focus(), 100);
    }

}
