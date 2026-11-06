/** Words on the final screen, in the game's language. Hebrew avoids gendered verbs. */
export const finalStrings = {
    en: {
        wins: (name: string) => `${name} WINS!`,
        tie: 'IT\'S A TIE!',
        and: '&',
        points: (n: number) => `${n} POINTS`,
        youWon: 'That\'s you. Champion!',
        youTied: 'You share the win!',
        yourPlace: (place: number, total: number) => `You came ${ordinal(place)} of ${total}`,
        rematch: 'REMATCH',
        rematchHint: 'Same players, new questions',
        share: 'SHARE RESULTS',
        bestLie: 'Best lie',
        fooled: (n: number) => n === 1 ? 'fooled 1 player' : `fooled ${n} players`,
        fooledNobody: 'Nobody fell for their lies',
        biggest: 'BIGGEST BULLSHITTER',
        you: 'YOU',
        crewLink: (name: string) => `${name || 'CREW'}: SCOREBOARD & REMATCH`,
        saveCrew: 'SAVE THIS CREW',
        crewHint: 'Name your crew to keep score across games and rematch in one tap.',
        crewPlaceholder: 'The Office Liars',
        save: 'SAVE',
        crewError: 'Could not save the crew',
    },
    he: {
        wins: (name: string) => `הניצחון של ${name}!`,
        tie: 'תיקו!',
        and: 'ו',
        points: (n: number) => `${n} נקודות`,
        youWon: 'ניצחת! כל הכבוד',
        youTied: 'ניצחון משותף!',
        yourPlace: (place: number, total: number) => `מקום ${place} מתוך ${total}`,
        rematch: 'משחק חוזר',
        rematchHint: 'אותם שחקנים, שאלות חדשות',
        share: 'שיתוף התוצאות',
        bestLie: 'השקר הכי טוב',
        fooled: (n: number) => `נפלו בזה: ${n}`,
        fooledNobody: 'אף אחד לא נפל בשקרים',
        biggest: 'הבולשיטר הגדול',
        you: 'אני',
        crewLink: (name: string) => `${name || 'החבורה'}: טבלה ומשחק חוזר`,
        saveCrew: 'שמירת החבורה',
        crewHint: 'תנו שם לחבורה כדי לספור ניצחונות בין משחקים ולשחק שוב בלחיצה.',
        crewPlaceholder: 'השקרנים מהמשרד',
        save: 'שמירה',
        crewError: 'לא הצלחנו לשמור את החבורה',
    },
};

export type FinalStrings = typeof finalStrings.en;

function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
