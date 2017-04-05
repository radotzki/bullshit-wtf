import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'bsPoints'
})
export class BsPointsPipe implements PipeTransform {

    transform(value: any, args?: any): any {
        return value <= 0 ? value : '+' + value;
    }

}
