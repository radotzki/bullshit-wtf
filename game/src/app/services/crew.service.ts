import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { tonightTime } from '../pages/crew/crew-night';

const crewsKey = 'BS_CREWS';
const SITE = 'https://bullshit.wtf';
const MAX_REMEMBERED = 12;

/** A remembered crew whose game night is today: the home page shows it first. */
export interface TonightCrew {
    id: string;
    name: string;
    /** "21:00" */
    time: string;
}

/** As much of a stored crew as the home page's line needs. */
interface CrewWithNight {
    name?: string;
    lastPlayed?: number;
    night?: { time: number };
}

/** A crew this browser played in: shown under "Your crews" on the home page. */
export interface RememberedCrew {
    id: string;
    name: string;
    nickname?: string;
    time: number;
}

const strings = {
    en: {
        inviteTitle: (name: string) => `${name}: Bullshit rematch`,
        inviteText: (name: string, leader: string) =>
            `Bullshit rematch for ${name}! ${leader}. Tap to see the scores and join:`,
    },
    he: {
        inviteTitle: (name: string) => `${name}: משחק חוזר בבולשיט`,
        inviteText: (name: string, leader: string) =>
            `משחק חוזר בבולשיט של ${name}! ${leader}. לחצו כדי לראות את הטבלה ולהצטרף:`,
    },
};

/**
 * Crews on this device. A crew has no accounts: whoever has its link can see it and start a
 * rematch, and each browser remembers the crews it played in and the nickname it used.
 */
@Injectable()
export class CrewService {

    constructor(private storageService: StorageService) { }

    list(): RememberedCrew[] {
        try {
            const crews = JSON.parse(this.storageService.getItem(crewsKey) || '[]');
            return Array.isArray(crews) ? crews.filter(c => c && c.id) : [];
        } catch (e) {
            return [];
        }
    }

    get(id: string): RememberedCrew {
        id = (id || '').toLowerCase();
        return this.list().filter(c => c.id === id)[0];
    }

    remember(id: string, name: string, nickname?: string) {
        if (!id) {
            return;
        }
        id = id.toLowerCase();
        const before = this.get(id);
        const entry: RememberedCrew = {
            id,
            name: name || (before && before.name) || '',
            nickname: nickname || (before && before.nickname),
            time: Date.now(),
        };
        const crews = [entry].concat(this.list().filter(c => c.id !== id)).slice(0, MAX_REMEMBERED);
        try {
            this.storageService.setItem(crewsKey, JSON.stringify(crews));
        } catch (e) { }
    }

    /**
     * The newest remembered crew, when its game night is today (or on right now). One crew read, and
     * only for a browser that remembers a crew; a read that fails is no night.
     */
    async tonight(read: (id: string) => Promise<CrewWithNight>, now = Date.now()): Promise<TonightCrew> {
        const newest = this.list()[0];
        if (!newest) {
            return null;
        }
        try {
            const crew = await read(newest.id);
            const time = crew && crew.night ? tonightTime(crew.night.time, now, crew.lastPlayed) : null;
            return time ? { id: newest.id, name: crew.name || newest.name, time } : null;
        } catch (e) {
            return null;
        }
    }

    crewUrl(id: string, locale: string) {
        return `${SITE}${locale === 'he' ? '/he' : ''}/c/${id.toLowerCase()}?via=crew`;
    }

    strings(locale: string) {
        return strings[locale === 'he' ? 'he' : 'en'];
    }
}
