import { storage } from '../applicationScripts/utilities.js';

// This is purely a client-side "you already did this" reminder, keyed to this
// browser -- it has no bearing on the server-side duplicate check in
// submitAlumniTripForm (the sha256(tripId+email) lock), which is what
// actually prevents a second PDF/Firestore doc. Without this, refreshing the
// page right after a successful submit re-renders the blank form from
// scratch (nothing else remembers the submission happened), which reads to a
// signer like their submission was lost.
const STORAGE_KEY = 'amsaAlumniTripSubmissions';

export function getStoredSubmissions() {
    return storage.get(STORAGE_KEY, []);
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
