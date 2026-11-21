export const environment = {
    production: true,
    cloudfunctions: 'https://us-central1-bullshit-wtf-prod.cloudfunctions.net/',
    firebaseConfig: {
        apiKey: 'AIzaSyCJSG67ebU9Bo-bvsCwJ9WcMnjHiBKwyhA',
        authDomain: 'bullshit-wtf-prod.firebaseapp.com',
        databaseURL: 'https://bullshit-wtf-prod.firebaseio.com',
        projectId: 'bullshit-wtf-prod',
        storageBucket: 'bullshit-wtf-prod.appspot.com',
        messagingSenderId: '1054623883511'
    },
    // The Discord Activity's app id (Discord Developer Portal > the app > General Information >
    // Application ID). A public id, not a secret. While it is the placeholder the game in Discord is
    // the site behind Discord's proxy, without the Activity's shell (app/portal/discord.ts).
    discordClientId: 'DISCORD_APP_ID_PLACEHOLDER',
    sentry: 'https://cbf5aaf3b4694fc2993289b77d2c7db6@sentry.io/144992'
};
