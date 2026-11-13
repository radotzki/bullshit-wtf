import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    standalone: false,
    name: 'bsQuestion'
})
export class BsQuestionPipe implements PipeTransform {

    transform(value: string, args?: any): any {
        return value.replace(/\$\s?blank\s?\$/gi, '________');
    }

}
