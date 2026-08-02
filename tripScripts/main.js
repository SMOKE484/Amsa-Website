import { elements, popiaText, POLICY_SECTIONS, DEFAULT_POLICY_TEXT } from './constants.js';
import { loadActiveTrips, tripsCache } from './trips.js';
import { signaturePad, parentSignaturePad, learnerSignaturePad } from './signature.js';
import { handleTripSubmit } from './submit.js';
import { getStoredSubmissions } from './submissionHistory.js';

document.addEventListener('DOMContentLoaded', () => {
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }

    if (elements.popiaTextContainer) elements.popiaTextContainer.textContent = popiaText;

    // withErrorHandling() (called inside loadActiveTrips) already shows a
    // toast and logs the error -- this catch just prevents an unhandled
    // promise rejection, it doesn't need to do anything further. Loaded
    // unconditionally (even if we're about to show the "already submitted"
    // view below) so the dropdown is ready the moment someone clicks
    // "Sign Up for a Different Trip".
    loadActiveTrips().catch(() => {});

    if (elements.tripSelect) {
        elements.tripSelect.addEventListener('change', () => {
            renderTripSpecificFields(tripsCache[elements.tripSelect.value]);
        });
    }

    if (elements.clearSignatureBtn) {
        elements.clearSignatureBtn.addEventListener('click', () => signaturePad.clear());
    }
    if (elements.clearParentSignatureBtn) {
        elements.clearParentSignatureBtn.addEventListener('click', () => parentSignaturePad.clear());
    }
    if (elements.clearLearnerSignatureBtn) {
        elements.clearLearnerSignatureBtn.addEventListener('click', () => learnerSignaturePad.clear());
    }

    if (elements.form) {
        elements.form.addEventListener('submit', handleTripSubmit);
    }

    if (elements.signUpAnotherTripBtn) {
        elements.signUpAnotherTripBtn.addEventListener('click', () => {
            elements.successSection.style.display = 'none';
            elements.formSection.style.display = 'block';
        });
    }

    // A page refresh re-runs this script from scratch with no memory of what
    // just happened -- without this check, a signer who just submitted and
    // hits refresh sees the blank form again and reasonably assumes their
    // submission was lost. Show the recorded confirmation instead.
    const priorSubmissions = getStoredSubmissions();
    if (priorSubmissions.length > 0) {
        showAlreadySubmittedOnLoad(priorSubmissions);
    }
});

// Swaps in everything specific to the selected trip: the form heading
// (audience-dependent title), a read-only logistics summary, which
// contact/signature block(s) are required, and the 7 per-trip policy
// sections. Called on every `tripSelect` change; passing `null` (nothing
// selected) resets the form back to its pre-selection placeholder state.
function renderTripSpecificFields(trip) {
    if (!trip) {
        elements.tripInfoSection.style.display = 'none';
        elements.yourContactSection.style.display = 'none';
        elements.parentGuardianSection.style.display = 'none';
        elements.alumniSignatureSection.style.display = 'none';
        elements.studentSignatureSection.style.display = 'none';
        elements.policySectionsContainer.innerHTML = '<p>Select a trip above to view its terms and conditions.</p>';
        elements.formTitle.textContent = 'Trip Sign-Up';
        return;
    }

    const isStudent = trip.audienceType === 'student';

    elements.formTitle.textContent = isStudent ? 'Parent/Guardian Consent Form' : 'Consent Form';

    elements.tripInfoLocation.textContent = trip.location ? `Location: ${trip.location}` : '';
    elements.tripInfoEventType.textContent = trip.eventType ? `Type of Event: ${trip.eventType}` : '';
    elements.tripInfoOrganizer.textContent = trip.organizerName ? `Organizer: ${trip.organizerName}` : '';
    elements.tripInfoIndividualsInCharge.textContent = trip.individualsInCharge ?
        `Individual(s) in Charge: ${trip.individualsInCharge}` : '';
    elements.tripInfoDeparture.textContent = trip.departureAt ? `Departure: ${formatDateTimeDisplay(trip.departureAt)}` : '';
    elements.tripInfoReturn.textContent = trip.returnAt ? `Return: ${formatDateTimeDisplay(trip.returnAt)}` : '';
    elements.tripInfoTransportMode.textContent = trip.transportMode ?
        `Mode of Transportation: ${trip.transportMode}` : '';
    elements.tripInfoSection.style.display = 'block';

    elements.yourContactSection.style.display = isStudent ? 'none' : 'block';
    elements.parentGuardianSection.style.display = isStudent ? 'block' : 'none';
    elements.birthDateRequiredMarker.style.display = isStudent ? 'inline' : 'none';

    elements.alumniSignatureSection.style.display = isStudent ? 'none' : 'block';
    elements.studentSignatureSection.style.display = isStudent ? 'block' : 'none';

    elements.policySectionsContainer.innerHTML = '';
    POLICY_SECTIONS.forEach(({ heading, field }) => {
        const headingEl = document.createElement('h4');
        headingEl.textContent = heading;
        const bodyEl = document.createElement('p');
        bodyEl.textContent = trip[field] || DEFAULT_POLICY_TEXT[field];
        elements.policySectionsContainer.appendChild(headingEl);
        elements.policySectionsContainer.appendChild(bodyEl);
    });
}

function formatDateTimeDisplay(isoString) {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('en-ZA', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function showAlreadySubmittedOnLoad(submissions) {
    if (!elements.formSection || !elements.successSection) return;
    elements.formSection.style.display = 'none';
    elements.successSection.style.display = 'block';
    if (elements.successMessage) {
        const tripList = submissions.map((s) => s.tripLabel).join(', ');
        elements.successMessage.textContent = submissions.length === 1 ?
            `You've already submitted a consent form for ${tripList} on this device. If you need to make a correction, please contact the office.` :
            `You've already submitted consent forms for: ${tripList}. If you need to make a correction, please contact the office.`;
    }
}
