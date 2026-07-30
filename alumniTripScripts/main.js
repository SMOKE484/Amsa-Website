import { elements, waiverText, popiaText } from './constants.js';
import { loadActiveTrips } from './trips.js';
import { clearTripSignature } from './signature.js';
import { handleAlumniTripSubmit } from './submit.js';

document.addEventListener('DOMContentLoaded', () => {
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }

    if (elements.waiverTextContainer) elements.waiverTextContainer.textContent = waiverText;
    if (elements.popiaTextContainer) elements.popiaTextContainer.textContent = popiaText;

    // withErrorHandling() (called inside loadActiveTrips) already shows a
    // toast and logs the error -- this catch just prevents an unhandled
    // promise rejection, it doesn't need to do anything further.
    loadActiveTrips().catch(() => {});

    if (elements.clearSignatureBtn) {
        elements.clearSignatureBtn.addEventListener('click', clearTripSignature);
    }

    if (elements.form) {
        elements.form.addEventListener('submit', handleAlumniTripSubmit);
    }
});
