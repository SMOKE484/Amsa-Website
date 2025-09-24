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
    return /^[a-zA-Z0-9-]{5,20}$/.test(id); // Adjust for specific ID format if needed
  }

  function validateDate(date) {
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Allow same-day signatures
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

  // Submit Application
  async function submitApplication(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    elements.finalAgreementError.style.display = 'none';
    if (!checkFirebaseInitialized()) {
      isSubmitting = false;
      return;
    }

    const user = window.firebaseAuth.currentUser;
    if (!user) {
      showToast('You must sign in first', 'error');
      isSubmitting = false;
      return;
    }

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
      finalAgreement: elements.finalAgreement.checked
    };

    const errors = [
      validateApplicationForm(formData),
      validateConsentForm(formData),
      validateRulesForm(formData),
      validatePledgeForm(formData)
    ].filter(Boolean);

    if (errors.length > 0) {
      showToast(errors.join(' '), 'error');
      elements.pledgeForm.reportValidity();
      isSubmitting = false;
      return;
    }

    try {
      spinner.style.display = 'block';
      spinner.setAttribute('aria-busy', 'true');
      const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);

      const existingDoc = await window.firebaseGetDoc(appRef);
      if (existingDoc.exists()) {
        showSection('existing');
        spinner.style.display = 'none';
        spinner.setAttribute('aria-busy', 'false');
        isSubmitting = false;
        return;
      }

      const reportRef = window.firebaseRef(window.firebaseStorage, `applications/${user.uid}/reportCard.pdf`);
      const idRef = window.firebaseRef(
        window.firebaseStorage,
        `applications/${user.uid}/idDocument.${formData.idDocumentFile.name.split('.').pop()}`
      );

      await Promise.all([
        window.firebaseUploadBytes(reportRef, formData.reportCardFile).catch(err => {
          console.error('Report card upload error:', err.code, err.message);
          throw new Error(err.code === 'storage/unauthorized'
            ? 'You do not have permission to upload files.'
            : `Report card upload failed: ${err.message}`);
        }),
        window.firebaseUploadBytes(idRef, formData.idDocumentFile).catch(err => {
          console.error('ID document upload error:', err.code, err.message);
          throw new Error(err.code === 'storage/unauthorized'
            ? 'You do not have permission to upload files.'
            : `ID document upload failed: ${err.message}`);
        })
      ]);

      const reportCardUrl = await window.firebaseGetDownloadURL(reportRef);
      const idDocumentUrl = await window.firebaseGetDownloadURL(idRef);

      await window.firebaseSetDoc(appRef, {
        userId: user.uid,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        parentEmail: formData.parentEmail,
        phone: formData.phone,
        grade: parseInt(formData.grade),
        school: formData.school,
        gender: formData.gender,
        subjects: formData.selectedSubjects,
        emergencyContact: {
          name: formData.parentName,
          relation: formData.parentRelationship,
          phone: formData.parentPhone,
          alternate: formData.alternateContact
        },
        reportCardUrl,
        idDocumentUrl,
        consentAgreement: {
          parentName: formData.parentFullName,
          learnerName: formData.learnerFullName,
          learnerId: formData.learnerId,
          programs: formData.selectedPrograms,
          transport: 'AMSA or public',
          parentSignature: formData.parentSignature,
          parentConsentDate: formData.parentConsentDate
        },
        rulesAcknowledgment: {
          rulesAgreed: formData.rulesAgreement
        },
        pledgeAgreement: {
          learnerName: formData.learnerFullNamePledge,
          learnerSignature: formData.learnerSignature,
          learnerSignatureDate: formData.learnerSignatureDate,
          parentName: formData.parentFullNamePledge,
          parentSignature: formData.parentSignaturePledge,
          parentSignatureDate: formData.parentSignatureDatePledge,
          finalAgreement: formData.finalAgreement
        },
        status: 'submitted',
        submittedAt: window.firebaseServerTimestamp()
      });

      elements.startApplicationBtn.style.display = 'none'; // Explicitly hide after submission
      showSection('status');
      if (elements.currentAppStatus) elements.currentAppStatus.textContent = 'submitted';
      if (elements.submittedDate) elements.submittedDate.textContent = new Date().toLocaleDateString('en-US', dateFormat);

      elements.applicationForm.reset();
      elements.consentForm.reset();
      elements.pledgeForm.reset();
      elements.reportCardName.textContent = '';
      elements.idDocumentName.textContent = '';
      elements.reportCard.type = '';
      elements.reportCard.type = 'file';
      elements.idDocument.type = '';
      elements.idDocument.type = 'file';
      signaturePads.parent.clear();
      signaturePads.learner.clear();
      signaturePads.parentPledge.clear();
      updateSubjects(elements.gradeSelect.value || '8');

    } catch (err) {
      console.error('Submission error:', err);
      showToast(`Error submitting: ${err.message}`, 'error');
    } finally {
      spinner.style.display = 'none';
      spinner.setAttribute('aria-busy', 'false');
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

  // Accessibility
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

  // Drag-and-drop support
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

  // Auth observer
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
              elements.startApplicationBtn.style.display = 'none'; // Hide button if application exists
              showSection('status');
              if (elements.currentAppStatus) elements.currentAppStatus.textContent = data.status || 'submitted';
              if (elements.submittedDate && data.submittedAt?.toDate) {
                elements.submittedDate.textContent = data.submittedAt.toDate().toLocaleDateString('en-US', dateFormat);
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

  // Set current year in footer
  if (elements.currentYear) {
    elements.currentYear.textContent = new Date().getFullYear();
  }

  // Cleanup event listeners
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

  // Initialize subjects
  updateSubjects(elements.gradeSelect.value || '8');
});