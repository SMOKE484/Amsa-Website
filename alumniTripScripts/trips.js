import { elements } from './constants.js';
import { showToast, withErrorHandling } from '../applicationScripts/utilities.js';

export async function loadActiveTrips() {
    await withErrorHandling(async () => {
        const tripsQuery = window.firebaseQuery(
            window.firebaseCollection(window.firebaseDb, 'alumniTrips'),
            window.firebaseWhere('active', '==', true)
        );
        const snapshot = await window.firebaseGetDocs(tripsQuery);

        elements.tripSelect.innerHTML = '<option value="">Select a trip</option>';

        if (snapshot.empty) {
            elements.tripSelect.innerHTML = '<option value="">No trips currently open for sign-up</option>';
            elements.submitBtn.disabled = true;
            return;
        }

        snapshot.forEach((docSnap) => {
            const trip = docSnap.data();
            const option = document.createElement('option');
            option.value = docSnap.id;
            option.textContent = trip.tripDate ? `${trip.name} — ${trip.tripDate}` : trip.name;
            elements.tripSelect.appendChild(option);
        });
    }, 'Unable to load available trips. Please refresh the page.', () => {
        elements.tripSelect.innerHTML = '<option value="">Unable to load trips — please refresh</option>';
        elements.submitBtn.disabled = true;
    });
}
