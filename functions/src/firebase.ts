const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

export const gamesRef = admin.database().ref('games');
export const qHistoryRef = admin.database().ref('qHistory');
export const gameCounterRef = admin.database().ref('gameCounter');
export const questionsRef = admin.database().ref('questions');

export function get<T>(ref): Promise<T> {
    return ref.once('value').then(s => s.val());
}
