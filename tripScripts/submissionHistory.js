import { storage } from '../applicationScripts/utilities.js';

// This is purely a client-side "you already did this" reminder, keyed to this
// browser -- it has no bearing on the server-side duplicate check in
// submitTripForm (the sha256(tripId+email) lock), which is what
// actually prevents a second PDF/Firestore doc. Without this, refreshing the
// page right after a successful submit re-renders the blank form from
// scratch (nothing else remembers the submission happened), which reads to a
// signer like their submission was lost.
const STORAGE_KEY = 'amsaTripSubmissions';
// Renamed from the "Alumni Trip" feature name. A real signer's browser may
// still have entries under the old key -- read them once so their "already
// submitted" state survives the rename instead of reverting to a blank form.
const LEGACY_STORAGE_KEY = 'amsaAlumniTripSubmissions';

export function getStoredSubmissions() {
    const current = storage.get(STORAGE_KEY, []);
    if (current.length > 0) return current;

    const legacy = storage.get(LEGACY_STORAGE_KEY, []);
    if (legacy.length > 0) {
        storage.set(STORAGE_KEY, legacy);
    }
    return legacy;
}

export function recordSubmission(tripId, tripLabel) {
    const submissions = getStoredSubmissions();
    const existing = submissions.find((s) => s.tripId === tripId);
    if (existing) {
        existing.tripLabel = tripLabel;
        existing.submittedAt = new Date().toISOString();
    } else {
        submissions.push({ tripId, tripLabel, submittedAt: new Date().toISOString() });
    }
    storage.set(STORAGE_KEY, submissions);
}
