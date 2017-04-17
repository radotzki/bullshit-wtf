import { Directive, ElementRef } from '@angular/core';

@Directive({
    selector: '[appAutofocus]'
})
export class AutofocusDirective {

    constructor(el: ElementRef) {
        setTimeout(() => el.nativeElement.focus(), 100);
    }

}
