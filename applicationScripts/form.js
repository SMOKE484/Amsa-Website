
import { elements } from './constants.js';
import { sanitizeInput, validateEmail, validatePhone, validateId, validateDate, validateFile, showToast, withErrorHandling, retryOperation, updateProgressIndicator } from './utilities.js';
import { showSection } from './ui.js';
import { saveApplicationAsDraft, completeApplicationSubmission } from './database.js';
import { signaturePads } from './signature.js';

// Form state management
const formState = {
    isSubmitting: false,
    validationErrors: {},
    currentSection: 'application'
};

export function validateApplicationForm(data) {
    const errors = [];
    
    if (!data.firstName?.trim()) errors.push('First name is required');
    if (!data.lastName?.trim()) errors.push('Last name is required');
    if (!data.school?.trim()) errors.push('Current school is required');
    if (!validateEmail(data.email)) errors.push('Valid student email is required');
    if (!validatePhone(data.phone)) errors.push('Valid student phone number is required');
    if (!validateEmail(data.parentEmail)) errors.push('Valid parent email is required');
    if (!validatePhone(data.parentPhone)) errors.push('Valid parent phone number is required');
    if (!data.grade) errors.push('Please select a grade');
    if (!data.gender) errors.push('Please select a gender');
    if (!data.parentName?.trim()) errors.push('Parent full name is required');
    if (!data.parentRelationship?.trim()) errors.push('Relationship to student is required');
    if (!data.reportCardFile || !validateFile(data.reportCardFile, ['application/pdf'], 5 * 1024 * 1024)) errors.push('Valid report card PDF is required (max 5MB)');
    if (!data.idDocumentFile || !validateFile(data.idDocumentFile, ['application/pdf', 'image/jpeg', 'image/png'], 5 * 1024 * 1024)) errors.push('Valid ID document is required (PDF or image, max 5MB)');
    if (data.selectedSubjects.length === 0) errors.push('Please select at least one subject');
    
    return errors.length > 0 ? errors : null;
}

export function validateConsentForm(data) {
    const errors = [];
    
    if (!data.parentFullName?.trim()) errors.push('Parent full name is required');
    if (!data.learnerFullName?.trim()) errors.push('Learner full name is required');
    if (!validateId(data.learnerId)) errors.push('Valid 13-digit learner ID number is required');
    if (data.selectedPrograms.length === 0) errors.push('Please select at least one program');
    if (!data.parentConsentDate || !validateDate(data.parentConsentDate)) errors.push('Valid parent consent date is required');
    if (!data.parentConsent) errors.push('You must consent to the terms');
    if (signaturePads.parent.isEmpty()) errors.push('Parent signature is required');
    
    return errors.length > 0 ? errors : null;
}

export function validateRulesForm(data) {
    const errors = [];
    
    if (!data.rulesAgreement) errors.push('You must acknowledge the academy rules and code of conduct');
    
    return errors.length > 0 ? errors : null;
}

export function validatePledgeForm(data) {
    const errors = [];
    
    if (!data.learnerFullNamePledge?.trim()) errors.push('Learner full name is required');
    if (!data.parentFullNamePledge?.trim()) errors.push('Parent full name is required');
    if (!data.learnerSignatureDate || !validateDate(data.learnerSignatureDate)) errors.push('Valid learner signature date is required');
    if (!data.parentSignatureDatePledge || !validateDate(data.parentSignatureDatePledge)) errors.push('Valid parent signature date is required');
    if (signaturePads.learner.isEmpty()) errors.push('Learner signature is required');
    if (signaturePads.parentPledge.isEmpty()) errors.push('Parent pledge signature is required');
    if (!data.finalAgreement) errors.push('You must confirm all information and agree to terms');
    
    return errors.length > 0 ? errors : null;
}

// Enhanced form submission with better error handling
export async function submitApplication(e) {
    if (formState.isSubmitting) {
        showToast('Application is already being submitted. Please wait.', 'warning');
        return null;
    }
    
    formState.isSubmitting = true;
    
    try {
        const user = window.firebaseAuth.currentUser;
        if (!user || !user.uid) {
            throw new Error('Please sign in before submitting your application.');
        }

        // Collect form data
        const formData = await getApplicationData();
        
        if (!formData) {
            throw new Error('Failed to collect application data');
        }

        // Validate all forms
        const validationErrors = [
            ...(validateApplicationForm(formData) || []),
            ...(validateConsentForm(formData) || []),
            ...(validateRulesForm(formData) || []),
            ...(validatePledgeForm(formData) || [])
        ];

        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join('. '));
        }

        // Check for existing application
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', formData.id);
        const existingDoc = await window.firebaseGetDoc(appRef);

        if (existingDoc.exists() && existingDoc.data().paymentStatus === 'paid') {
            // Complete existing application
            await completeApplicationSubmission(formData);
            return formData;
        }

        // Save as draft first with retry logic
        await retryOperation(
            () => saveApplicationAsDraft(formData),
            3,
            1000
        );

        return formData;

    } catch (error) {
        console.error('Submission error:', error);
        showToast(error.message || 'Error processing application. Please try again.', 'error');
        return null;
    } finally {
        formState.isSubmitting = false;
    }
}

// Enhanced application data collection
export async function getApplicationData() {
    const user = window.firebaseAuth.currentUser;
    if (!user || !user.uid) {
        throw new Error('User not authenticated');
    }

    try {
        const formData = {
            // Application form data
            firstName: sanitizeInput(elements.firstName.value.trim()),
            lastName: sanitizeInput(elements.lastName.value.trim()),
            email: elements.emailInput.value.trim(),
            parentEmail: elements.parentEmailInput.value.trim(),
            phone: elements.phoneInput.value.trim(),
            grade: elements.gradeSelect.value,
            school: sanitizeInput(elements.school.value.trim()),
            gender: elements.gender.value,
            parentName: sanitizeInput(elements.parentName.value.trim()),
            parentRelationship: sanitizeInput(elements.parentRelationship.value.trim()),
            parentPhone: elements.parentPhoneInput.value.trim(),
            alternateContact: sanitizeInput(elements.alternateContact.value.trim()),
            selectedSubjects: Array.from(document.querySelectorAll('input[name="subjects"]:checked')).map(cb => cb.value),
            reportCardFile: elements.reportCard.files[0],
            idDocumentFile: elements.idDocument.files[0],
            
            // Consent form data
            parentFullName: sanitizeInput(elements.parentFullName.value.trim()),
            learnerFullName: sanitizeInput(elements.learnerFullName.value.trim()),
            learnerId: sanitizeInput(elements.learnerId.value.trim()),
            selectedPrograms: Array.from(document.querySelectorAll('input[name="programs"]:checked')).map(cb => cb.value),
            parentConsentDate: elements.parentConsentDate.value,
            parentConsent: elements.consentCheckbox.checked,
            parentSignature: signaturePads.parent.toDataURL(),
            
            // Rules form data
            rulesAgreement: elements.rulesAgreement.checked,
            
            // Pledge form data
            learnerFullNamePledge: sanitizeInput(elements.learnerFullNamePledge.value.trim()),
            learnerSignatureDate: elements.learnerSignatureDate.value,
            learnerSignature: signaturePads.learner.toDataURL(),
            parentFullNamePledge: sanitizeInput(elements.parentFullNamePledge.value.trim()),
            parentSignatureDatePledge: elements.parentSignatureDatePledge.value,
            parentSignaturePledge: signaturePads.parentPledge.toDataURL(),
            finalAgreement: elements.finalAgreement.checked,
            
            // Metadata
            id: user.uid,
            timestamp: new Date().toISOString()
        };

        return formData;

    } catch (error) {
        console.error('Error getting application data:', error);
        throw new Error('Failed to collect application data: ' + error.message);
    }
}

// Enhanced form navigation with validation
export function initializeFormNavigation() {
    // Application → Consent
    elements.nextToConsentBtn.addEventListener('click', () => {
        withErrorHandling(() => {
            const applicationData = {
                firstName: sanitizeInput(elements.firstName.value.trim()),
                lastName: sanitizeInput(elements.lastName.value.trim()),
                email: elements.emailInput.value.trim(),
                parentEmail: elements.parentEmailInput.value.trim(),
                phone: elements.phoneInput.value.trim(),
                grade: elements.gradeSelect.value,
                school: sanitizeInput(elements.school.value.trim()),
                gender: elements.gender.value,
                parentName: sanitizeInput(elements.parentName.value.trim()),
                parentRelationship: sanitizeInput(elements.parentRelationship.value.trim()),
                parentPhone: elements.parentPhoneInput.value.trim(),
                alternateContact: sanitizeInput(elements.alternateContact.value.trim()),
                selectedSubjects: Array.from(document.querySelectorAll('input[name="subjects"]:checked')).map(cb => cb.value),
                reportCardFile: elements.reportCard.files[0],
                idDocumentFile: elements.idDocument.files[0]
            };

            const errors = validateApplicationForm(applicationData);
            if (errors) {
                showToast(errors[0], 'error');
                elements.applicationForm.reportValidity();
                return;
            }
            
            showSection('consent');
            updateProgressIndicator('consent');
        }, 'Error validating application form');
    });

    // Consent → Application (Back)
    elements.backToApplicationBtn.addEventListener('click', () => {
        showSection('application');
        updateProgressIndicator('application');
    });

    // Consent → Rules
    elements.nextToRulesBtn.addEventListener('click', () => {
        withErrorHandling(() => {
            const consentData = {
                parentFullName: sanitizeInput(elements.parentFullName.value.trim()),
                learnerFullName: sanitizeInput(elements.learnerFullName.value.trim()),
                learnerId: sanitizeInput(elements.learnerId.value.trim()),
                selectedPrograms: Array.from(document.querySelectorAll('input[name="programs"]:checked')).map(cb => cb.value),
                parentConsentDate: elements.parentConsentDate.value,
                parentConsent: elements.consentCheckbox.checked
            };

            const errors = validateConsentForm(consentData);
            if (errors) {
                showToast(errors[0], 'error');
                elements.consentForm.reportValidity();
                return;
            }
            
            // Save signature
            elements.parentSignature.value = signaturePads.parent.toDataURL();
            showSection('rules');
            updateProgressIndicator('rules');
        }, 'Error validating consent form');
    });

    // Rules → Consent (Back)
    elements.backToConsentBtn.addEventListener('click', () => {
        showSection('consent');
        updateProgressIndicator('consent');
    });

    // Rules → Pledge
    elements.nextToPledgeBtn.addEventListener('click', () => {
        withErrorHandling(() => {
            const rulesData = { rulesAgreement: elements.rulesAgreement.checked };
            const errors = validateRulesForm(rulesData);
            
            if (errors) {
                showToast(errors[0], 'error');
                elements.rulesAgreementError.textContent = errors[0];
                elements.rulesAgreementError.style.display = 'block';
                return;
            }
            
            elements.rulesAgreementError.style.display = 'none';
            showSection('pledge');
            updateProgressIndicator('pledge');
        }, 'Error validating rules form');
    });

    // Pledge → Rules (Back)
    elements.backToRulesBtn.addEventListener('click', () => {
        showSection('rules');
        updateProgressIndicator('rules');
    });
}

// Real-time field validation
export function setupRealTimeValidation() {
    // Email validation
    elements.emailInput.addEventListener('blur', () => {
        const errors = validateEmail(elements.emailInput.value) ? [] : ['Please enter a valid email address'];
        showFieldValidation('email', errors);
    });

    // Phone validation
    elements.phoneInput.addEventListener('blur', () => {
        const errors = validatePhone(elements.phoneInput.value) ? [] : ['Please enter a valid South African phone number'];
        showFieldValidation('phone', errors);
    });

    // Parent phone validation
    elements.parentPhoneInput.addEventListener('blur', () => {
        const errors = validatePhone(elements.parentPhoneInput.value) ? [] : ['Please enter a valid South African phone number'];
        showFieldValidation('parentPhone', errors);
    });

    // ID validation
    elements.learnerId.addEventListener('blur', () => {
        const errors = validateId(elements.learnerId.value) ? [] : ['Please enter a valid 13-digit ID number'];
        showFieldValidation('learnerId', errors);
    });
}

// Show field validation errors
function showFieldValidation(fieldName, errors) {
    // Remove existing error messages for this field
    const existingError = document.getElementById(`${fieldName}Error`);
    if (existingError) {
        existingError.remove();
    }

    // Add new error message if there are errors
    if (errors.length > 0) {
        const field = document.getElementById(fieldName);
        const errorElement = document.createElement('div');
        errorElement.id = `${fieldName}Error`;
        errorElement.className = 'field-error';
        errorElement.style.color = '#e64a2e';
        errorElement.style.fontSize = '0.875rem';
        errorElement.style.marginTop = '0.25rem';
        errorElement.textContent = errors[0];
        
        field.parentNode.appendChild(errorElement);
        field.classList.add('error');
    } else {
        const field = document.getElementById(fieldName);
        field.classList.remove('error');
    }
}

// Form reset functionality
export function resetForms() {
    // Reset all form elements
    const forms = [
        elements.applicationForm,
        elements.consentForm,
        elements.pledgeForm
    ];
    
    forms.forEach(form => {
        if (form) {
            form.reset();
        }
    });
    
    // Clear signature pads
    Object.values(signaturePads).forEach(pad => {
        if (pad && pad.clear) {
            pad.clear();
        }
    });
    
    // Clear file inputs
    elements.reportCard.value = '';
    elements.idDocument.value = '';
    
    // Reset file name displays
    const reportCardName = document.getElementById('reportCardName');
    const idDocumentName = document.getElementById('idDocumentName');
    if (reportCardName) reportCardName.textContent = '';
    if (idDocumentName) idDocumentName.textContent = '';
    
    // Clear validation errors
    const errorElements = document.querySelectorAll('.field-error');
    errorElements.forEach(error => error.remove());
    
    // Reset form state
    formState.isSubmitting = false;
    formState.validationErrors = {};
    
    showToast('Form has been reset', 'info');
}

// Initialize real-time validation when the module loads
setupRealTimeValidation();
