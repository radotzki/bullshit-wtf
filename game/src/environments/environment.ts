// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
    production: false,
    cloudfunctions: 'https://us-central1-bullshit-wtf-dev.cloudfunctions.net/',
    firebaseConfig: {
        apiKey: 'AIzaSyDgUaXkz8z2mUXIeb-XDy97ko1P9zUq6Us',
        authDomain: 'bullshit-wtf-dev.firebaseapp.com',
        databaseURL: 'https://bullshit-wtf-dev.firebaseio.com',
        projectId: 'bullshit-wtf-dev',
        storageBucket: 'bullshit-wtf-dev.appspot.com',
        messagingSenderId: '351075272123'
    },
    sentry: 'https://9fd70ebdc2c744569ccb0000896cb0ca@sentry.io/285990'
};
