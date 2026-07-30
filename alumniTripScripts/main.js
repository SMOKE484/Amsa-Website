import { elements, waiverText, popiaText } from './constants.js';
import { loadActiveTrips } from './trips.js';
import { clearTripSignature } from './signature.js';
import { handleAlumniTripSubmit } from './submit.js';
import { getStoredSubmissions } from './submissionHistory.js';

document.addEventListener('DOMContentLoaded', () => {
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }

    if (elements.waiverTextContainer) elements.waiverTextContainer.textContent = waiverText;
    if (elements.popiaTextContainer) elements.popiaTextContainer.textContent = popiaText;

    // withErrorHandling() (called inside loadActiveTrips) already shows a
    // toast and logs the error -- this catch just prevents an unhandled
    // promise rejection, it doesn't need to do anything further. Loaded
    // unconditionally (even if we're about to show the "already submitted"
    // view below) so the dropdown is ready the moment someone clicks
    // "Sign Up for a Different Trip".
    loadActiveTrips().catch(() => {});

    if (elements.clearSignatureBtn) {
        elements.clearSignatureBtn.addEventListener('click', clearTripSignature);
    }

    if (elements.form) {
        elements.form.addEventListener('submit', handleAlumniTripSubmit);
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
