import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-validate-token',
    template: '',
})
export class ValidateTokenComponent implements OnInit {

    constructor(
        private activatedRoute: ActivatedRoute,
        private router: Router,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        const redirect = this.activatedRoute.snapshot.params['redirect'];
        const email = this.activatedRoute.snapshot.params['email'];
        const token = this.activatedRoute.snapshot.params['token'];

        this.apiService.validateToken(email, token)
            .then(user => {
                this.sessionService.user = Object.assign({}, user, { email });
                this.router.navigate([redirect]);
            })
            .catch(err => {
                this.router.navigate(['/']);
            });
    }

}
