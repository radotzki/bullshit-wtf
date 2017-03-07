import { ApiService } from './../../services/api.service';
import { ActivatedRoute, Params } from '@angular/router';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-signin',
    templateUrl: './signin.component.html',
    styleUrls: ['./signin.component.scss']
})
export class SigninComponent implements OnInit {
    errorMsg: string;
    redirect: string;
    email: string;
    name: string;
    registerMode: boolean;
    waitForMail: boolean;
    loading: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.redirect = this.activatedRoute.snapshot.params['redirect'];
    }

    submit() {
        if (this.registerMode) {
            this.register();
        } else {
            this.signin();
        }
    }

    signin() {
        this.loading = true;

        this.apiService.signin(this.email, this.redirect)
            .then(() => {
                this.waitForMail = true;
                this.loading = false;
            })
            .catch((err) => {
                this.loading = false;
                if (err.code === 'NO_ACCOUNT') {
                    this.registerMode = true;
                } else {
                    // TODO: SENTRY
                    this.errorMsg = 'oops, something wrong happend. Please try again';
                }
            });
    }

    register() {
        this.loading = true;

        this.apiService.register(this.email, this.name)
            .then(() => this.signin())
            .catch(err => this.errorMsg = err.message);
    }

}
