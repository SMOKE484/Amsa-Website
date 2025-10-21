document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements (cached for performance)
  const elements = {
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userInfo: document.getElementById('userInfo'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    startApplicationBtn: document.getElementById('startApplicationBtn'),
    applicationSection: document.getElementById('applicationSection'),
    applicationForm: document.getElementById('applicationForm'),
    consentSection: document.getElementById('consentSection'),
    consentForm: document.getElementById('consentForm'),
    rulesSection: document.getElementById('rulesSection'),
    pledgeSection: document.getElementById('pledgeSection'),
    pledgeForm: document.getElementById('pledgeForm'),
    applicationStatus: document.getElementById('applicationStatus'),
    existingApplication: document.getElementById('existingApplication'),
    reportCardUpload: document.getElementById('reportCardUpload'),
    reportCard: document.getElementById('reportCard'),
    reportCardName: document.getElementById('reportCardName'),
    idDocumentUpload: document.getElementById('idDocumentUpload'),
    idDocument: document.getElementById('idDocument'),
    idDocumentName: document.getElementById('idDocumentName'),
    subjectsContainer: document.getElementById('subjectsContainer'),
    consentCheckbox: document.getElementById('parentConsent'),
    consentError: document.getElementById('parentConsentError'),
    rulesAgreement: document.getElementById('rulesAgreement'),
    rulesAgreementError: document.getElementById('rulesAgreementError'),
    finalAgreement: document.getElementById('finalAgreement'),
    finalAgreementError: document.getElementById('finalAgreementError'),
    gradeSelect: document.getElementById('grade'),
    emailInput: document.getElementById('email'),
    phoneInput: document.getElementById('phone'),
    parentEmailInput: document.getElementById('parentEmail'),
    parentPhoneInput: document.getElementById('parentPhone'),
    currentAppStatus: document.getElementById('currentAppStatus'),
    submittedDate: document.getElementById('submittedDate'),
    firstName: document.getElementById('firstName'),
    lastName: document.getElementById('lastName'),
    school: document.getElementById('school'),
    gender: document.getElementById('gender'),
    parentName: document.getElementById('parentName'),
    parentRelationship: document.getElementById('parentRelationship'),
    alternateContact: document.getElementById('alternateContact'),
    parentFullName: document.getElementById('parentFullName'),
    learnerFullName: document.getElementById('learnerFullName'),
    learnerId: document.getElementById('learnerId'),
    parentSignaturePad: document.getElementById('signaturePad'),
    clearSignature: document.getElementById('clearSignature'),
    parentSignature: document.getElementById('parentSignature'),
    parentConsentDate: document.getElementById('parentConsentDate'),
    learnerFullNamePledge: document.getElementById('learnerFullNamePledge'),
    learnerSignatureDate: document.getElementById('learnerSignatureDate'),
    learnerSignaturePad: document.getElementById('learnerSignaturePad'),
    clearLearnerSignature: document.getElementById('clearLearnerSignature'),
    learnerSignature: document.getElementById('learnerSignature'),
    parentFullNamePledge: document.getElementById('parentFullNamePledge'),
    parentSignatureDatePledge: document.getElementById('parentSignatureDatePledge'),
    parentSignaturePadPledge: document.getElementById('parentSignaturePadPledge'),
    clearParentSignaturePledge: document.getElementById('clearParentSignaturePledge'),
    parentSignaturePledge: document.getElementById('parentSignaturePledge'),
    nextToConsentBtn: document.getElementById('nextToConsentBtn'),
    backToApplicationBtn: document.getElementById('backToApplicationBtn'),
    nextToRulesBtn: document.getElementById('nextToRulesBtn'),
    backToConsentBtn: document.getElementById('backToConsentBtn'),
    nextToPledgeBtn: document.getElementById('nextToPledgeBtn'),
    backToRulesBtn: document.getElementById('backToRulesBtn'),
    contactSupportBtn: document.getElementById('contactSupportBtn'),
    toastContainer: document.getElementById('toastContainer'),
    currentYear: document.getElementById('currentYear')
  };

  // Spinner
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.style.display = 'none';
  spinner.innerHTML = '<i class="fas fa-spinner fa-spin fa-2x"></i> Submitting...';
  spinner.setAttribute('aria-live', 'polite');
  spinner.setAttribute('aria-busy', 'true');
  elements.applicationSection.appendChild(spinner);

  // Signature Pads
  const signaturePads = {
    parent: new SignaturePad(elements.parentSignaturePad, { penColor: 'black' }),
    learner: new SignaturePad(elements.learnerSignaturePad, { penColor: 'black' }),
    parentPledge: new SignaturePad(elements.parentSignaturePadPledge, { penColor: 'black' })
  };

  // Subjects
  const subjects = {
    "8-9": ["Natural Sciences", "Mathematics", "Social Sciences"],
    "10-12": [
      "Mathematics", "Physical Sciences", "Business Studies", "English",
      "Agricultural Sciences", "Geography", "Life Sciences", "Mathematics Literacy", "Accounting"
    ]
  };

  let isSubmitting = false;
  const dateFormat = { year: 'numeric', month: 'long', day: 'numeric' };

  // Utility Functions
  function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePhone(phone) {
    return /^\+?\d{10,15}$/.test(phone);
  }

  function validateId(id) {
    return /^[a-zA-Z0-9-]{5,20}$/.test(id);
  }

  function validateDate(date) {
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return selectedDate <= today && !isNaN(selectedDate.getTime());
  }

  function validateFile(file, acceptedTypes, maxSize) {
    if (!file) return false;
    if (!acceptedTypes.includes(file.type)) {
      showToast(`Invalid file type. Accepted: ${acceptedTypes.join(', ')}`, 'error');
      return false;
    }
    if (file.size > maxSize) {
      showToast('File too large. Max size: 5MB', 'error');
      return false;
    }
    return true;
  }

  function validateApplicationForm(data) {
    if (!data.firstName || !data.lastName || !data.school) return 'Please fill in all required text fields.';
    if (!validateEmail(data.email)) return 'Invalid student email.';
    if (!validatePhone(data.phone)) return 'Invalid student phone.';
    if (!data.parentEmail || !validateEmail(data.parentEmail)) return 'Invalid parent email.';
    if (!data.parentPhone || !validatePhone(data.parentPhone)) return 'Invalid parent phone.';
    if (!data.grade) return 'Please select a grade.';
    if (!data.gender) return 'Please select a gender.';
    if (!data.parentName || !data.parentRelationship) return 'Please fill in all parent contact details.';
    if (!validateFile(data.reportCardFile, ['application/pdf'], 5 * 1024 * 1024)) return 'Invalid report card file.';
    if (!validateFile(data.idDocumentFile, ['application/pdf', 'image/jpeg', 'image/png'], 5 * 1024 * 1024)) return 'Invalid ID document file.';
    if (data.selectedSubjects.length === 0) return 'Please select at least one subject.';
    return null;
  }

  function validateConsentForm(data) {
    if (!data.parentFullName || !data.learnerFullName || !data.learnerId) return 'Please fill in all consent fields.';
    if (!validateId(data.learnerId)) return 'Invalid learner ID number.';
    if (data.selectedPrograms.length === 0) return 'Please select at least one program.';
    if (!data.parentConsentDate || !validateDate(data.parentConsentDate)) return 'Invalid parent consent date.';
    if (!data.parentConsent) return 'You must consent to the terms.';
    if (signaturePads.parent.isEmpty()) return 'Please provide a parent signature.';
    return null;
  }

  function validateRulesForm(data) {
    if (!data.rulesAgreement) return 'You must acknowledge the academy rules and code of conduct.';
    return null;
  }

  function validatePledgeForm(data) {
    if (!data.learnerFullNamePledge || !data.parentFullNamePledge) return 'Please provide both learner and parent full names.';
    if (!data.learnerSignatureDate || !validateDate(data.learnerSignatureDate)) return 'Invalid learner signature date.';
    if (!data.parentSignatureDatePledge || !validateDate(data.parentSignatureDatePledge)) return 'Invalid parent signature date.';
    if (signaturePads.learner.isEmpty()) return 'Please provide a learner signature.';
    if (signaturePads.parentPledge.isEmpty()) return 'Please provide a parent pledge signature.';
    if (!data.finalAgreement) return 'You must confirm all information and agree to terms.';
    return null;
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  function checkFirebaseInitialized() {
    try {
      return (
        window.firebaseAuth &&
        window.firebaseGoogleAuthProvider &&
        window.firebaseSignInWithPopup &&
        window.firebaseSignOut &&
        window.firebaseDb &&
        window.firebaseStorage &&
        window.firebaseRef &&
        window.firebaseCollection &&
        window.firebaseQuery &&
        window.firebaseWhere &&
        window.firebaseGetDocs &&
        window.firebaseSetDoc &&
        window.firebaseDoc &&
        window.firebaseGetDoc &&
        window.firebaseServerTimestamp &&
        window.firebaseUploadBytes &&
        window.firebaseGetDownloadURL
      );
    } catch (err) {
      console.error('Firebase initialization check failed:', err);
      showToast('Application error: Firebase services are unavailable. Please try again later.', 'error');
      return false;
    }
  }

  // Yoco Payment Integration
  async function initiateYocoPayment(applicationData) {
    try {
      showPaymentLoading(true);
      
      // Validate application data
      if (!applicationData.id || !applicationData.email) {
        throw new Error('Invalid application data');
      }

      // Check if Yoco SDK is loaded
      if (typeof window.YocoSDK === 'undefined') {
        console.error('Yoco SDK not loaded');
        throw new Error('Payment system is not available. Please refresh the page and try again.');
      }

      // Get card details from form
      const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
      const cardExpiry = document.getElementById('cardExpiry').value.split('/');
      const cardCvc = document.getElementById('cardCvc').value;
      const cardName = document.getElementById('cardName').value;

      // Validate card details
      if (!cardNumber || !cardExpiry[0] || !cardExpiry[1] || !cardCvc || !cardName) {
        throw new Error('Please fill in all card details');
      }

      // Validate card number length
      if (cardNumber.length < 13 || cardNumber.length > 19) {
        throw new Error('Invalid card number length');
      }

      // Validate expiry
      const expiryMonth = cardExpiry[0].trim();
      const expiryYear = cardExpiry[1].trim();
      
      if (parseInt(expiryMonth) < 1 || parseInt(expiryMonth) > 12) {
        throw new Error('Invalid expiry month');
      }

      console.log('Initializing Yoco SDK...');

      // Initialize Yoco SDK with inline popup
      const yoco = new window.YocoSDK({
        publicKey: 'pk_test_ed3c54a6gOol69qa7f45'
      });

      console.log('Creating Yoco token with card details...');

      // Create payment token using the inline method
      const result = await new Promise((resolve, reject) => {
        yoco.showPopup({
          amountInCents: 15000,
          currency: 'ZAR',
          name: 'Alusani Academy',
          description: 'Application Fee',
          callback: function(result) {
            if (result.error) {
              reject(new Error(result.error.message));
            } else {
              resolve(result);
            }
          }
        });
      });

      console.log('Yoco token created:', result);

      // Process charge (simulate server-side processing)
      const chargeResult = await processYocoCharge({
        token: result.id,
        amountInCents: 15000, // R150.00 in cents
        currency: 'ZAR',
        description: 'Alusani Academy Application Fee',
        applicationId: applicationData.id,
        customerEmail: applicationData.email
      });

      if (chargeResult.success) {
        // Update application status in Firebase
        await updateApplicationPaymentStatus(applicationData.id, 'paid');
        showToast('Payment successful! Your application has been submitted.', 'success');
        
        // Complete the application submission
        await completeApplicationSubmission(applicationData);
        
        return true;
      } else {
        throw new Error(chargeResult.error || 'Payment failed');
      }

    } catch (error) {
      console.error('Yoco payment error:', error);
      
      // User-friendly error messages
      let errorMessage = 'Payment failed. Please try again.';
      if (error.message?.includes('card_declined')) {
        errorMessage = 'Card was declined. Please use a different card.';
      } else if (error.message?.includes('insufficient_funds')) {
        errorMessage = 'Insufficient funds. Please use a different card.';
      } else if (error.message?.includes('invalid_card')) {
        errorMessage = 'Invalid card details. Please check and try again.';
      } else if (error.message?.includes('token')) {
        errorMessage = 'Payment processing error. Please try again.';
      } else if (error.message?.includes('not available')) {
        errorMessage = error.message;
      }
      
      showToast(errorMessage, 'error');
      return false;
    } finally {
      showPaymentLoading(false);
    }
  }

  // Simulate server-side charge processing
  async function processYocoCharge(chargeData) {
    console.log('Processing Yoco charge:', chargeData);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // For testing, always return success
    // In production, this would call your backend API
    return {
      success: true,
      chargeId: 'ch_' + Math.random().toString(36).substr(2, 9),
      amount: chargeData.amountInCents,
      currency: chargeData.currency,
      description: chargeData.description
    };
  }

  // Update application payment status
  async function updateApplicationPaymentStatus(applicationId, status) {
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    await window.firebaseSetDoc(appRef, {
      paymentStatus: status,
      status: 'submitted',
      submittedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
      updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    }, { merge: true });
  }

  // Show Yoco payment modal
  function showYocoPaymentModal(applicationData) {
    return new Promise((resolve) => {
      // Check if Yoco SDK is loaded
      if (typeof window.YocoSDK === 'undefined') {
        showToast('Payment system is not available. Please ensure you have an internet connection and refresh the page.', 'error');
        resolve(false);
        return;
      }

      const modal = document.getElementById('yocoPaymentModal');
      const confirmBtn = document.getElementById('confirmYocoPayment');
      const cancelBtn = document.getElementById('cancelYocoPayment');
      const closeBtn = modal.querySelector('.close');

      // Hide custom card form fields (Yoco will use its own popup)
      const cardForm = modal.querySelector('.card-form');
      if (cardForm) {
        cardForm.style.display = 'none';
      }

      // Show info message
      const infoDiv = modal.querySelector('.payment-info') || document.createElement('div');
      infoDiv.className = 'payment-info';
      infoDiv.innerHTML = `
        <p style="margin: 20px 0; padding: 15px; background: #f0f9ff; border-radius: 8px; color: #1e40af;">
          <strong>Application Fee: R150.00</strong><br>
          Click "Proceed to Payment" to complete your payment securely via Yoco.
        </p>
      `;
      if (!modal.querySelector('.payment-info')) {
        modal.querySelector('.modal-content').insertBefore(infoDiv, confirmBtn.parentElement);
      }

      modal.style.display = 'flex';

      const cleanup = () => {
        modal.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
      };

      confirmBtn.textContent = 'Proceed to Payment';
      
      confirmBtn.onclick = async () => {
        cleanup();
        
        try {
          const paymentSuccess = await initiateYocoPayment(applicationData);
          resolve(paymentSuccess);
        } catch (error) {
          console.error('Payment error:', error);
          resolve(false);
        }
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      modal.onclick = (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      };
    });
  }

  // Card input formatting functions
  function formatCardNumber(input) {
    let value = input.value.replace(/\s/g, '').replace(/\D/g, '');
    let formattedValue = '';
    
    for (let i = 0; i < value.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formattedValue += ' ';
      }
      formattedValue += value[i];
    }
    
    input.value = formattedValue.trim();
  }

  function formatExpiryDate(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 2) {
      input.value = value.substring(0, 2) + '/' + value.substring(2, 4);
    } else {
      input.value = value;
    }
  }

  // Payment modal function (compatibility)
  function showPaymentModal(formData) {
    return showYocoPaymentModal(formData);
  }

  function showPaymentLoading(show) {
    const loading = document.getElementById('paymentLoading');
    if (loading) {
      loading.style.display = show ? 'flex' : 'none';
    }
  }

  // Update Subjects
  function updateSubjects(grade) {
    const selected = Array.from(document.querySelectorAll('input[name="subjects"]:checked')).map(cb => cb.value);
    elements.subjectsContainer.innerHTML = '';
    if (!grade) return;
    const fragment = document.createDocumentFragment();
    let gradeCategory = (parseInt(grade) <= 9) ? '8-9' : '10-12';
    subjects[gradeCategory].forEach(subject => {
      const div = document.createElement('div');
      div.className = 'subject-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'subjects';
      input.value = subject;
      input.id = `sub-${subject.replace(/\s+/g, '-')}`;
      if (selected.includes(subject)) input.checked = true;
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = subject;
      div.appendChild(input);
      div.appendChild(label);
      fragment.appendChild(div);
    });
    elements.subjectsContainer.appendChild(fragment);
  }

  // Google Sign-In
  async function signInWithGoogle() {
    if (!checkFirebaseInitialized()) return;
    try {
      const provider = new window.firebaseGoogleAuthProvider();
      await window.firebaseSignInWithPopup(window.firebaseAuth, provider);
    } catch (err) {
      console.error('Sign-in error:', err.code, err.message);
      const message = err.code === 'auth/popup-closed-by-user'
        ? 'Sign-in was cancelled. Please try again.'
        : `Sign-in failed: ${err.message}`;
      showToast(message, 'error');
    }
  }

  // Logout
  async function doLogout() {
    if (!checkFirebaseInitialized()) return;
    try {
      await window.firebaseSignOut(window.firebaseAuth);
    } catch (err) {
      console.error('Sign-out error:', err);
      showToast(`Error signing out: ${err.message}`, 'error');
    }
  }

  // Form Navigation and Validation
  function showSection(section) {
    elements.applicationSection.style.display = section === 'application' ? 'block' : 'none';
    elements.consentSection.style.display = section === 'consent' ? 'block' : 'none';
    elements.rulesSection.style.display = section === 'rules' ? 'block' : 'none';
    elements.pledgeSection.style.display = section === 'pledge' ? 'block' : 'none';
    elements.applicationStatus.style.display = section === 'status' ? 'block' : 'none';
    elements.existingApplication.style.display = section === 'existing' ? 'block' : 'none';
    elements.startApplicationBtn.style.display = section === 'application' ? 'inline-flex' : 'none';
  }

  elements.nextToConsentBtn.addEventListener('click', () => {
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

    const error = validateApplicationForm(applicationData);
    if (error) {
      showToast(error, 'error');
      elements.applicationForm.reportValidity();
      return;
    }
    showSection('consent');
  });

  elements.backToApplicationBtn.addEventListener('click', () => showSection('application'));

  elements.nextToRulesBtn.addEventListener('click', () => {
    const consentData = {
      parentFullName: sanitizeInput(elements.parentFullName.value.trim()),
      learnerFullName: sanitizeInput(elements.learnerFullName.value.trim()),
      learnerId: sanitizeInput(elements.learnerId.value.trim()),
      selectedPrograms: Array.from(document.querySelectorAll('input[name="programs"]:checked')).map(cb => cb.value),
      parentConsentDate: elements.parentConsentDate.value,
      parentConsent: elements.consentCheckbox.checked
    };

    const error = validateConsentForm(consentData);
    if (error) {
      showToast(error, 'error');
      elements.consentForm.reportValidity();
      return;
    }
    elements.parentSignature.value = signaturePads.parent.toDataURL();
    showSection('rules');
  });

  elements.backToConsentBtn.addEventListener('click', () => showSection('consent'));

  elements.nextToPledgeBtn.addEventListener('click', () => {
    const rulesData = { rulesAgreement: elements.rulesAgreement.checked };
    const error = validateRulesForm(rulesData);
    if (error) {
      showToast(error, 'error');
      elements.rulesAgreementError.textContent = error;
      elements.rulesAgreementError.style.display = 'block';
      return;
    }
    elements.rulesAgreementError.style.display = 'none';
    showSection('pledge');
  });

  elements.backToRulesBtn.addEventListener('click', () => showSection('rules'));

  // Save application as draft
  async function saveApplicationAsDraft(formData) {
    const user = window.firebaseAuth.currentUser;
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);

    const draftData = {
      userId: user.uid,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      grade: formData.grade,
      school: formData.school,
      subjects: formData.selectedSubjects,
      status: 'payment_pending',
      paymentStatus: 'pending',
      amount: 150.00,
      formData: formData,
      createdAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
      updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    };

    delete draftData.formData.reportCardFile;
    delete draftData.formData.idDocumentFile;
    delete draftData.formData.parentSignature;
    delete draftData.formData.learnerSignature;
    delete draftData.formData.parentSignaturePledge;

    await window.firebaseSetDoc(appRef, draftData, { merge: true });
    console.log('Application saved as draft pending payment');
  }

  // Complete application submission after payment
  async function completeApplicationSubmission(formData) {
    const user = window.firebaseAuth.currentUser;
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);

    try {
      spinner.style.display = 'block';

      const reportCardUrl = await uploadFile(formData.reportCardFile, 'reportCard');
      const idDocumentUrl = await uploadFile(formData.idDocumentFile, 'idDocument');

      const applicationData = {
        ...formData,
        reportCardUrl,
        idDocumentUrl,
        status: 'submitted',
        submittedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
        paymentStatus: 'paid'
      };

      await window.firebaseSetDoc(appRef, applicationData);
      showSection('status');
      showToast('Application submitted successfully!', 'success');

    } catch (error) {
      console.error('Error completing application:', error);
      showToast('Error submitting application. Please try again.', 'error');
    } finally {
      spinner.style.display = 'none';
      isSubmitting = false;
    }
  }

  async function uploadFile(file, fileType) {
    const user = window.firebaseAuth.currentUser;
    const fileRef = window.firebaseRef(window.firebaseStorage, `applications/${user.uid}/${fileType}_${Date.now()}.${file.name.split('.').pop()}`);

    await window.firebaseUploadBytes(fileRef, file);
    return await window.firebaseGetDownloadURL(fileRef);
  }

  // Submit Application
  async function submitApplication(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    try {
      const formData = {
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
        parentFullName: sanitizeInput(elements.parentFullName.value.trim()),
        learnerFullName: sanitizeInput(elements.learnerFullName.value.trim()),
        learnerId: sanitizeInput(elements.learnerId.value.trim()),
        selectedPrograms: Array.from(document.querySelectorAll('input[name="programs"]:checked')).map(cb => cb.value),
        parentConsentDate: elements.parentConsentDate.value,
        parentConsent: elements.consentCheckbox.checked,
        parentSignature: signaturePads.parent.toDataURL(),
        rulesAgreement: elements.rulesAgreement.checked,
        learnerFullNamePledge: sanitizeInput(elements.learnerFullNamePledge.value.trim()),
        learnerSignatureDate: elements.learnerSignatureDate.value,
        learnerSignature: signaturePads.learner.toDataURL(),
        parentFullNamePledge: sanitizeInput(elements.parentFullNamePledge.value.trim()),
        parentSignatureDatePledge: elements.parentSignatureDatePledge.value,
        parentSignaturePledge: signaturePads.parentPledge.toDataURL(),
        finalAgreement: elements.finalAgreement.checked,
        id: window.firebaseAuth.currentUser.uid
      };

      const errors = [
        validateApplicationForm(formData),
        validateConsentForm(formData),
        validateRulesForm(formData),
        validatePledgeForm(formData)
      ].filter(Boolean);

      if (errors.length > 0) {
        showToast(errors.join(' '), 'error');
        isSubmitting = false;
        return;
      }

      const appRef = window.firebaseDoc(window.firebaseDb, 'applications', formData.id);
      const existingDoc = await window.firebaseGetDoc(appRef);

      if (existingDoc.exists() && existingDoc.data().paymentStatus === 'paid') {
        await completeApplicationSubmission(formData);
        return;
      }

      await saveApplicationAsDraft(formData);

      const proceedToPayment = await showPaymentModal(formData);

      if (proceedToPayment) {
        // Payment is handled within the Yoco modal
        // Application submission continues automatically on success
      } else {
        showToast('Please complete payment to submit your application.', 'info');
      }

    } catch (error) {
      console.error('Submission error:', error);
      showToast('Error processing application. Please try again.', 'error');
    } finally {
      isSubmitting = false;
    }
  }

  // Event Listeners
  if (elements.loginBtn) elements.loginBtn.addEventListener('click', signInWithGoogle);
  elements.logoutBtn.addEventListener('click', doLogout);
  elements.startApplicationBtn.addEventListener('click', () => showSection('application'));
  elements.pledgeForm.addEventListener('submit', submitApplication);

  elements.reportCardUpload.addEventListener('click', () => elements.reportCard.click());
  elements.reportCard.addEventListener('change', debounce((e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!validateFile(file, ['application/pdf'], 5 * 1024 * 1024)) return;
      elements.reportCardName.textContent = `Selected file: ${file.name}`;
    }
  }, 300));

  elements.idDocumentUpload.addEventListener('click', () => elements.idDocument.click());
  elements.idDocument.addEventListener('change', debounce((e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!validateFile(file, ['application/pdf', 'image/jpeg', 'image/png'], 5 * 1024 * 1024)) return;
      elements.idDocumentName.textContent = `Selected file: ${file.name}`;
    }
  }, 300));

  elements.clearSignature.addEventListener('click', () => {
    signaturePads.parent.clear();
    elements.parentSignature.value = '';
  });

  elements.clearLearnerSignature.addEventListener('click', () => {
    signaturePads.learner.clear();
    elements.learnerSignature.value = '';
  });

  elements.clearParentSignaturePledge.addEventListener('click', () => {
    signaturePads.parentPledge.clear();
    elements.parentSignaturePledge.value = '';
  });

  elements.contactSupportBtn.addEventListener('click', () => {
    showToast('Please contact support at info@alusaniacademy.edu.za', 'info');
  });

  [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
    uploadArea.setAttribute('tabindex', '0');
    uploadArea.setAttribute('role', 'button');
    uploadArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        uploadArea.id === 'reportCardUpload' ? elements.reportCard.click() : elements.idDocument.click();
      }
    });
  });

  elements.gradeSelect.addEventListener('change', (e) => updateSubjects(e.target.value));

  [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', debounce((e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      const targetInput = uploadArea.id === 'reportCardUpload' ? elements.reportCard : elements.idDocument;
      const targetName = uploadArea.id === 'reportCardUpload' ? elements.reportCardName : elements.idDocumentName;
      const acceptedTypes = uploadArea.id === 'reportCardUpload'
        ? ['application/pdf']
        : ['application/pdf', 'image/jpeg', 'image/png'];
      if (file && validateFile(file, acceptedTypes, 5 * 1024 * 1024)) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        targetInput.files = dataTransfer.files;
        targetName.textContent = `Selected file: ${file.name}`;
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 300));
  });

  // Card input formatting event listeners
  document.addEventListener('input', function(e) {
    if (e.target.id === 'cardNumber') {
      formatCardNumber(e.target);
    } else if (e.target.id === 'cardExpiry') {
      formatExpiryDate(e.target);
    } else if (e.target.id === 'cardCvc') {
      // Only allow numbers for CVC
      e.target.value = e.target.value.replace(/\D/g, '');
    }
  });

  if (checkFirebaseInitialized()) {
    window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
      try {
        spinner.style.display = 'block';
        spinner.setAttribute('aria-busy', 'true');
        if (user) {
          elements.loginBtn.style.display = 'none';
          elements.logoutBtn.style.display = 'inline-flex';
          elements.userInfo.style.display = 'flex';
          elements.userName.textContent = user.displayName || user.email;
          elements.userAvatar.textContent = (user.displayName || user.email)[0].toUpperCase();
          elements.emailInput.value = user.email;

          const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
          try {
            const docSnap = await window.firebaseGetDoc(appRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              elements.startApplicationBtn.style.display = 'none';
              if (data.paymentStatus === 'paid' && data.status === 'submitted') {
                showSection('status');
                if (elements.currentAppStatus) elements.currentAppStatus.textContent = data.status || 'submitted';
                if (elements.submittedDate && data.submittedAt?.toDate) {
                  elements.submittedDate.textContent = data.submittedAt.toDate().toLocaleDateString('en-US', dateFormat);
                }
              } else {
                showSection('application');
                elements.startApplicationBtn.style.display = 'inline-flex';
              }
            } else {
              elements.startApplicationBtn.style.display = 'inline-flex';
              showSection('application');
            }
          } catch (err) {
            console.error('Error fetching application:', err);
            showToast('Unable to load application status. Please try again later.', 'error');
          }
        } else {
          elements.loginBtn.style.display = 'inline-flex';
          elements.logoutBtn.style.display = 'none';
          elements.userInfo.style.display = 'none';
          elements.startApplicationBtn.style.display = 'none';
          showSection('application');
          elements.applicationStatus.style.display = 'none';
          elements.existingApplication.style.display = 'none';
        }
      } finally {
        spinner.style.display = 'none';
        spinner.setAttribute('aria-busy', 'false');
      }
    });
  }

  if (elements.currentYear) {
    elements.currentYear.textContent = new Date().getFullYear();
  }

  const cleanup = () => {
    if (elements.loginBtn) elements.loginBtn.removeEventListener('click', signInWithGoogle);
    elements.logoutBtn.removeEventListener('click', doLogout);
    elements.startApplicationBtn.removeEventListener('click', () => {});
    elements.pledgeForm.removeEventListener('submit', submitApplication);
    elements.nextToConsentBtn.removeEventListener('click', () => {});
    elements.backToApplicationBtn.removeEventListener('click', () => {});
    elements.nextToRulesBtn.removeEventListener('click', () => {});
    elements.backToConsentBtn.removeEventListener('click', () => {});
    elements.nextToPledgeBtn.removeEventListener('click', () => {});
    elements.backToRulesBtn.removeEventListener('click', () => {});
    elements.reportCardUpload.removeEventListener('click', () => {});
    elements.reportCard.removeEventListener('change', () => {});
    elements.idDocumentUpload.removeEventListener('click', () => {});
    elements.idDocument.removeEventListener('change', () => {});
    elements.clearSignature.removeEventListener('click', () => {});
    elements.clearLearnerSignature.removeEventListener('click', () => {});
    elements.clearParentSignaturePledge.removeEventListener('click', () => {});
    elements.contactSupportBtn.removeEventListener('click', () => {});
    elements.gradeSelect.removeEventListener('change', () => {});
    [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
      uploadArea.removeEventListener('dragover', () => {});
      uploadArea.removeEventListener('dragleave', () => {});
      uploadArea.removeEventListener('drop', () => {});
      uploadArea.removeEventListener('keydown', () => {});
    });
  };
  window.addEventListener('unload', cleanup);

  updateSubjects(elements.gradeSelect.value || '8');
});