import { elements } from './constants.js';
import { showToast, retryOperation } from '../applicationScripts/utilities.js';
import { collectTripFormData, validateTripForm, getSelectedAudienceType } from './form.js';
import { signaturePad, parentSignaturePad, learnerSignaturePad } from './signature.js';
import { recordSubmission } from './submissionHistory.js';

let isSubmitting = false;

export async function handleTripSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
        showToast('Your form is already being submitted. Please wait.', 'warning');
        return;
    }

    const data = collectTripFormData();
    const errors = validateTripForm(data);
    if (errors) {
        showToast(errors[0], 'error');
        return;
    }

    const isStudent = getSelectedAudienceType() === 'student';

    isSubmitting = true;
    elements.submitBtn.disabled = true;
    const originalLabel = elements.submitBtn.innerHTML;
    elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        const payload = { ...data };
        if (isStudent) {
            payload.parentSignatureDataUrl = parentSignaturePad.toDataURL();
            payload.learnerSignatureDataUrl = learnerSignaturePad.toDataURL();
        } else {
            payload.signatureDataUrl = signaturePad.toDataURL();
        }

        const submitTripForm = window.firebaseCallable(window.firebaseFunctions, 'submitTripForm');
        const result = await retryOperation(() => submitTripForm(payload), 3, 1000);
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
        signaturePad.clear();
        parentSignaturePad.clear();
        learnerSignaturePad.clear();

    } catch (error) {
        console.error('Error submitting trip form:', error);
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
