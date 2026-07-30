import { elements } from './constants.js';
import { showToast, retryOperation } from '../applicationScripts/utilities.js';
import { collectAlumniTripFormData, validateAlumniTripForm } from './form.js';
import { signaturePad, clearTripSignature } from './signature.js';
import { recordSubmission } from './submissionHistory.js';

let isSubmitting = false;

export async function handleAlumniTripSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
        showToast('Your form is already being submitted. Please wait.', 'warning');
        return;
    }

    const data = collectAlumniTripFormData();
    const errors = validateAlumniTripForm(data);
    if (errors) {
        showToast(errors[0], 'error');
        return;
    }

    isSubmitting = true;
    elements.submitBtn.disabled = true;
    const originalLabel = elements.submitBtn.innerHTML;
    elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        const payload = {
            ...data,
            signatureDataUrl: signaturePad.toDataURL('image/png')
        };

        const submitAlumniTripForm = window.firebaseCallable(window.firebaseFunctions, 'submitAlumniTripForm');
        const result = await retryOperation(() => submitAlumniTripForm(payload), 3, 1000);
        const response = result.data;

        if (response.duplicate) {
            showToast(response.message || "You've already submitted a consent form for this trip.", 'info');
        } else {
            showToast('Your consent form has been submitted successfully.', 'success');
        }

        // Grab the selected trip's display text before form.reset() clears the <select>.
        const selectedOption = elements.tripSelect.options[elements.tripSelect.selectedIndex];
        const tripLabel = selectedOption ? selectedOption.textContent : data.tripId;
        recordSubmission(data.tripId, tripLabel);

        showSuccessState(response, tripLabel);
        elements.form.reset();
        clearTripSignature();

    } catch (error) {
        console.error('Error submitting alumni trip form:', error);
        showToast(error.message || 'Error submitting your consent form. Please try again.', 'error');
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = originalLabel;
    } finally {
        isSubmitting = false;
    }
}

function showSuccessState(response, tripLabel) {
    if (!elements.formSection || !elements.successSection) return;
    elements.formSection.style.display = 'none';
    elements.successSection.style.display = 'block';
    if (elements.successMessage) {
        elements.successMessage.textContent = response.duplicate ?
            `You've already submitted a consent form for ${tripLabel}. No further action is needed.` :
            `Thank you — your consent form for ${tripLabel} has been recorded.`;
    }
}
