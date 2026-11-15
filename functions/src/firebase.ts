import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// FIREBASE_CONFIG is set by the Cloud Functions runtime (databaseURL, projectId, ...).
// Passing options disables admin's own auto-config, so read it explicitly.
const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
initializeApp(Object.assign(
    {},
    firebaseConfig,
    { databaseAuthVariableOverride: { uid: 'bl-service-worker' } }
));
const db = getDatabase();

export const gamesRef = db.ref('games');
export const qHistoryRef = db.ref('qHistory');
// The daily puzzle's tallies (controllers/daily.ts). They live under qHistory because that path is
// already open to the server alone, and the game only ever pushes to it and never reads it: a path
// of their own would need a new database rule, and a release that changes the rules stops on the
// Realtime Database Management API, which is off in the project. If that API is ever switched on,
// move this to a path of its own.
export const dailyRef = qHistoryRef.child('daily');
export const gameCounterRef = db.ref('gameCounter');
export const questionsRef = db.ref('questions');
export const seenQuestionsRef = db.ref('seenQuestions');
export const crewsRef = db.ref('crews');

export function get<T>(ref): Promise<T> {
    return ref.once('value').then(s => s.val());
}
