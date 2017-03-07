import { Http } from '@angular/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';

@Injectable()
export class ApiService {

    constructor(
        private http: Http,
    ) { }

    signin(email: string, redirect: string) {
        return this.post(`get-token`, { email, redirect });
    }

    register(email: string, name: string) {
        return this.post(`register`, { email, name });
    }

    validateToken(email: string, token: string): Promise<{ token: string, id: string, name: string }> {
        return this.post(`validate-token`, { email, token });
    }

    private post(url: string, body: Object) {
        return this.http.post(environment.server + '/' + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(resp.json()));
    }

}
