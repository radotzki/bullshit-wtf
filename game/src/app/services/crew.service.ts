import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';

const crewsKey = 'BS_CREWS';
const SITE = 'https://bullshit.wtf';
const MAX_REMEMBERED = 12;

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

    crewUrl(id: string, locale: string) {
        return `${SITE}${locale === 'he' ? '/he' : ''}/c/${id.toLowerCase()}?via=crew`;
    }

    strings(locale: string) {
        return strings[locale === 'he' ? 'he' : 'en'];
    }
}
