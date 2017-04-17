import { Directive, ElementRef } from '@angular/core';

@Directive({
    selector: '[ngxAutofocus]'
})
export class NgxAutofocusDirective {

    constructor(el: ElementRef) {
        setTimeout(() => el.nativeElement.focus(), 100);
    }

}
