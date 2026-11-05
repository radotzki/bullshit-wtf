const admin = require('firebase-admin');

// FIREBASE_CONFIG is set by the Cloud Functions runtime (databaseURL, projectId, ...).
// Passing options disables admin's own auto-config, so read it explicitly.
const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
admin.initializeApp(Object.assign(
    {},
    firebaseConfig,
    { databaseAuthVariableOverride: { uid: 'bl-service-worker' } }
));

export const gamesRef = admin.database().ref('games');
export const qHistoryRef = admin.database().ref('qHistory');
export const gameCounterRef = admin.database().ref('gameCounter');
export const questionsRef = admin.database().ref('questions');
export const seenQuestionsRef = admin.database().ref('seenQuestions');

export function get<T>(ref): Promise<T> {
    return ref.once('value').then(s => s.val());
}
