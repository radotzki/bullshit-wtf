import { NgModule } from '@angular/core';
import { AngularFireModule } from 'angularfire2';

export const firebaseConfig = {
    apiKey: 'AIzaSyB9DBGta81H3qp3BMukjNF-pHKbh2RPcvA',
    authDomain: 'bullshit-fae48.firebaseapp.com',
    databaseURL: 'https://bullshit-fae48.firebaseio.com',
    storageBucket: 'bullshit-fae48.appspot.com',
    messagingSenderId: '328908700392',
};

@NgModule({
    imports: [AngularFireModule.initializeApp(firebaseConfig)],
})
export class FirebaseModule { }
