const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

export const gamesRef = admin.database().ref('games');
export const gameCounterRef = admin.database().ref('gameCounter');

export function get<T>(ref): Promise<T> {
    return ref.once('value').then(s => s.val());
}
