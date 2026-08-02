import { elements } from './constants.js';
import { validateEmail, validatePhone, validateDate } from '../applicationScripts/utilities.js';
import { signaturePad, parentSignaturePad, learnerSignaturePad } from './signature.js';
import { tripsCache } from './trips.js';

// Audience type drives which fields/signatures are required. Always
// re-derived from the currently selected trip's cached doc rather than
// stored separately, so it can never drift out of sync with the dropdown.
export function getSelectedAudienceType() {
    const trip = tripsCache[elements.tripSelect.value];
    return trip && trip.audienceType === 'student' ? 'student' : 'alumni';
}

export function collectTripFormData() {
    const audienceType = getSelectedAudienceType();
    const isStudent = audienceType === 'student';

    const data = {
        tripId: elements.tripSelect.value,
        participantName: elements.participantName.value,
        birthDate: elements.birthDate.value,
        emergencyContactName: elements.emergencyContactName.value,
        emergencyContactPhone: elements.emergencyContactPhone.value,
        emergencyContactRelationship: elements.emergencyContactRelationship.value,
        medicalConditions: elements.medicalConditions.value,
        allergies: elements.allergies.value,
        medicalAidDetails: elements.medicalAidDetails.value,
        agreedToTerms: elements.agreedToTerms.checked,
        popiaConsent: elements.popiaConsent.checked,
        // Untouched honeypot value passes through as-is; real bot detection
        // happens server-side in submitTripForm.
        honeypot: elements.honeypot.value
    };

    if (isStudent) {
        data.parentGuardianName = elements.parentGuardianName.value;
        data.parentGuardianAddress = elements.parentGuardianAddress.value;
        data.parentGuardianHomePhone = elements.parentGuardianHomePhone.value;
        data.parentGuardianWorkPhone = elements.parentGuardianWorkPhone.value;
        data.parentGuardianEmail = elements.parentGuardianEmail.value;
    } else {
        data.email = elements.email.value;
        data.phone = elements.phone.value;
    }

    return data;
}

export function validateTripForm(data) {
    const errors = [];
    const isStudent = getSelectedAudienceType() === 'student';

    if (!data.tripId) errors.push('Please select a trip');
    if (!data.participantName?.trim()) errors.push('Participant name is required');
    if (!data.emergencyContactName?.trim()) errors.push('Emergency contact name is required');
    if (!validatePhone(data.emergencyContactPhone)) errors.push('A valid emergency contact phone number is required');
    if (!data.emergencyContactRelationship?.trim()) errors.push('Emergency contact relationship is required');
    if (!data.agreedToTerms) errors.push('You must agree to the terms and conditions to submit this form');
    if (!data.popiaConsent) errors.push('You must consent to the processing of your personal information');

    if (isStudent) {
        if (!validateDate(data.birthDate)) errors.push('A valid birth date is required');
        if (!data.parentGuardianName?.trim()) errors.push('Parent/guardian name is required');
        if (!data.parentGuardianAddress?.trim()) errors.push('Parent/guardian home address is required');
        if (!validatePhone(data.parentGuardianHomePhone)) errors.push('A valid parent/guardian home phone number is required');
        if (data.parentGuardianWorkPhone?.trim() && !validatePhone(data.parentGuardianWorkPhone)) {
            errors.push('The parent/guardian work phone number is invalid');
        }
        if (!validateEmail(data.parentGuardianEmail)) errors.push('A valid parent/guardian email address is required');
        if (parentSignaturePad.isEmpty()) errors.push('The parent/guardian signature is required');
        if (learnerSignaturePad.isEmpty()) errors.push('The learner signature is required');
    } else {
        if (!validateEmail(data.email)) errors.push('A valid email address is required');
        if (!validatePhone(data.phone)) errors.push('A valid South African phone number is required');
        if (signaturePad.isEmpty()) errors.push('Your signature is required');
    }

    return errors.length > 0 ? errors : null;
}
