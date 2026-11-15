/**
 * Prototype / mock per-school database. Stands in for the backend + Postgres.
 * One document per school under fs:school:<id>:db. No API crosses schools.
 */
import { storage, storageKeys } from '../../services/storage';
import { SchoolDb, SEEDS, SEED_VERSION } from './seed';

interface Stored {
  version: string;
  db: SchoolDb;
}

const cache = new Map<string, SchoolDb>();

export function getDb(schoolId: string): SchoolDb {
  if (!schoolId) throw new Error('schoolId is required');
  const hit = cache.get(schoolId);
  if (hit) return hit;
  const key = storageKeys.school(schoolId, 'db');
  const stored = storage.get<Stored | null>(key, null);
  let db: SchoolDb;
  if (stored && stored.version === SEED_VERSION) {
    db = stored.db;
  } else {
    const seed = SEEDS[schoolId];
    db = seed ? seed() : emptyDb(schoolId);
    storage.set<Stored>(key, { version: SEED_VERSION, db });
  }
  cache.set(schoolId, db);
  return db;
}

export function saveDb(db: SchoolDb): void {
  cache.set(db.schoolId, db);
  storage.set<Stored>(storageKeys.school(db.schoolId, 'db'), { version: SEED_VERSION, db });
}

function emptyDb(schoolId: string): SchoolDb {
  return {
    schoolId, classSections: [], students: [], timetables: {}, homework: [], notices: [], consents: [], meetings: [],
    instalments: [], charges: [], concessions: [], payments: [], refunds: [], lateFeePolicy: '', exams: [],
    hallTicketReleases: [], results: [], threads: [], leaves: [], registers: [], assessments: [], marksSheets: [], reportCards: [], changeRequests: [], corrections: [], teacherLeaves: [], complaints: [], transportRoutes: [], transportRequests: []
  };
}

/** Test helper: drop in-memory cache. */
export function _resetDbCache(): void {
  cache.clear();
}
