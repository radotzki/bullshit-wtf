// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
    production: false,
    cloudfunctions: 'https://us-central1-bullshit-fae48.cloudfunctions.net/',
    firebaseConfig: {
        apiKey: 'AIzaSyB9DBGta81H3qp3BMukjNF-pHKbh2RPcvA',
        authDomain: 'bullshit-fae48.firebaseapp.com',
        databaseURL: 'https://bullshit-fae48.firebaseio.com',
        storageBucket: 'bullshit-fae48.appspot.com',
        messagingSenderId: '328908700392',
    }
};
