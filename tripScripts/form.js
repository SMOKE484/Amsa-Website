import { elements } from './constants.js';
import { validateEmail, validatePhone } from '../applicationScripts/utilities.js';
import { signaturePad } from './signature.js';

export function collectTripFormData() {
    return {
        tripId: elements.tripSelect.value,
        fullName: elements.fullName.value,
        email: elements.email.value,
        phone: elements.phone.value,
        emergencyContactName: elements.emergencyContactName.value,
        emergencyContactPhone: elements.emergencyContactPhone.value,
        emergencyContactRelationship: elements.emergencyContactRelationship.value,
        medicalConditions: elements.medicalConditions.value,
        allergies: elements.allergies.value,
        medicalAidDetails: elements.medicalAidDetails.value,
        waiverAgreed: elements.waiverAgreed.checked,
        popiaConsent: elements.popiaConsent.checked,
        // Untouched honeypot value passes through as-is; real bot detection
        // happens server-side in submitTripForm.
        honeypot: elements.honeypot.value
    };
}

export function validateTripForm(data) {
    const errors = [];

    if (!data.tripId) errors.push('Please select a trip');
    if (!data.fullName?.trim()) errors.push('Full name is required');
    if (!validateEmail(data.email)) errors.push('A valid email address is required');
    if (!validatePhone(data.phone)) errors.push('A valid South African phone number is required');
    if (!data.emergencyContactName?.trim()) errors.push('Emergency contact name is required');
    if (!validatePhone(data.emergencyContactPhone)) errors.push('A valid emergency contact phone number is required');
    if (!data.emergencyContactRelationship?.trim()) errors.push('Emergency contact relationship is required');
    if (!data.waiverAgreed) errors.push('You must agree to the waiver to submit this form');
    if (!data.popiaConsent) errors.push('You must consent to the processing of your personal information');
    if (signaturePad.isEmpty()) errors.push('Your signature is required');

    return errors.length > 0 ? errors : null;
}
