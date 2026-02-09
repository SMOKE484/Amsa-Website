// main.js

import { elements, subjects } from './constants.js';
import { signInWithGoogle, doLogout } from './auth.js';
import { showSection, updateSubjects, updateButtonState } from './ui.js';
import { submitApplication, initializeFormNavigation, getApplicationData } from './form.js';
import { initializeSignaturePads, clearSignature, clearLearnerSignature, clearParentSignaturePledge } from './signature.js';
import { handleFileUpload, handleFileDrop } from './storage.js';
import { checkApplicationStatus, handlePaymentReturn, loadDashboardData, setupApplicationListener,preSaveApplication } from './database.js';
import { showToast, debounce, setupAutoSave, withErrorHandling } from './utilities.js';
import { showPaystackPaymentModal, initiateTuitionPayment, generateMonthlyPayments, initializePaymentPlanSelection, checkAndHidePaymentPlan } from './payments.js';

// Application state management
const appState = {
    currentStep: 'application',
    formData: {},
    isSubmitting: false,
    autoSave: null
};

document.addEventListener('DOMContentLoaded', () => {
    initializeApplication();
});

async function initializeApplication() {
    try {
        await handlePaymentReturn();

        createLoadingSpinner();

        await initializeComponents();

        setupEventListeners();

        setupAutoSaveFeatures();

    } catch (error) {
        console.error('Application initialization failed:', error);
        showToast('Failed to initialize application. Please refresh the page.', 'error');
    }
}

function createLoadingSpinner() {
    let spinner = document.querySelector('.loading-spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.display = 'none';
        spinner.innerHTML = '<i class="fas fa-spinner fa-spin fa-2x"></i> Submitting...';
        spinner.setAttribute('aria-live', 'polite');
        spinner.setAttribute('aria-busy', 'false');

        const formContainer = document.querySelector('.form-container') || document.body;
        formContainer.appendChild(spinner);

    } else {
        spinner.style.display = 'none';
        spinner.setAttribute('aria-busy', 'false');
    }
}

async function initializeComponents() {
    initializeSignaturePads();

    initializeFormNavigation();

    initializeDashboardTabs();
    initializeTuitionPayments();
    initializeMonthlyPayments();
    initializePaymentPlanDropdown();

    await setupAuthListener();

    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }

    updateSubjects(elements.gradeSelect?.value || '8');
}

function setupEventListeners() {
    if (elements.loginBtn) elements.loginBtn.addEventListener('click', signInWithGoogle);
    elements.logoutBtn.addEventListener('click', doLogout);
    elements.startApplicationBtn.addEventListener('click', () => showSection('application'));

    elements.pledgeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await withErrorHandling(
            () => submitApplicationWithPayment(e),
            'Error submitting application'
        );
    });

    setupFileUploadListeners();

    setupFormNavigationListeners();

    elements.contactSupportBtn.addEventListener('click', () => {
        showToast('Please contact support at info@alusaniacademy.edu.za', 'info');
    });

    const enableBtn = document.getElementById('enableNotificationsBtn');
    if (enableBtn) {
        enableBtn.addEventListener('click', async () => {
            await requestNotificationPermissionAndSaveToken();
        });
    }
}

function setupFileUploadListeners() {
    if (elements.reportCardUpload && elements.reportCard) {
        elements.reportCardUpload.addEventListener('click', () => elements.reportCard.click());
        elements.reportCard.addEventListener('change', debounce((e) => handleFileUpload(e, 'reportCard'), 300));
    }

    if (elements.idDocumentUpload && elements.idDocument) {
        elements.idDocumentUpload.addEventListener('click', () => elements.idDocument.click());
        elements.idDocument.addEventListener('change', debounce((e) => handleFileUpload(e, 'idDocument'), 300));
    }

    [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
        if (!uploadArea) return;

        uploadArea.setAttribute('tabindex', '0');
        uploadArea.setAttribute('role', 'button');
        uploadArea.setAttribute('aria-label', `Upload ${uploadArea.id.includes('report') ? 'report card' : 'ID document'}`);

        uploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (uploadArea.id === 'reportCardUpload' && elements.reportCard) {
                     elements.reportCard.click();
                } else if (uploadArea.id === 'idDocumentUpload' && elements.idDocument) {
                     elements.idDocument.click();
                }
            }
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', (e) => {
             e.preventDefault();
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', debounce((e) => handleFileDrop(e, uploadArea), 300));
    });
}

function setupFormNavigationListeners() {
    if (elements.gradeSelect) {
        elements.gradeSelect.addEventListener('change', (e) => updateSubjects(e.target.value));
    }

    if (elements.clearSignature) elements.clearSignature.addEventListener('click', clearSignature);
    if (elements.clearLearnerSignature) elements.clearLearnerSignature.addEventListener('click', clearLearnerSignature);
    if (elements.clearParentSignaturePledge) elements.clearParentSignaturePledge.addEventListener('click', clearParentSignaturePledge);
}

function setupAutoSaveFeatures() {
    const forms = {
        application: elements.applicationForm,
        consent: elements.consentForm,
        rules: document.querySelector('#rulesSection form'),
        pledge: elements.pledgeForm
    };

    Object.keys(forms).forEach(section => {
        if (forms[section]) {
            setupAutoSave(forms[section], `app_${section}_data`);
        }
    });
}

async function setupAuthListener() {
    if (window.firebaseAuth && typeof window.firebaseOnAuthStateChanged === 'function') {
        window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
            const spinner = document.querySelector('.loading-spinner');

            await withErrorHandling(async () => {
                if (spinner) {
                    spinner.style.display = 'flex';
                    spinner.setAttribute('aria-busy', 'true');
                }

                if (user) {
                    await handleAuthenticatedUser(user);
                } else {
                    handleUnauthenticatedUser();
                }
            }, 'Error during authentication state change');

            if (spinner) {
                spinner.style.display = 'none';
                spinner.setAttribute('aria-busy', 'false');
            }
        });
    } else {
         showToast("Authentication service failed to load.", "error");
         handleUnauthenticatedUser();
    }
}

async function handleAuthenticatedUser(user) {
    if (elements.loginBtn) elements.loginBtn.style.display = 'none';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'inline-flex';
    if (elements.userInfo) elements.userInfo.style.display = 'flex';
    if (elements.userName) elements.userName.textContent = user.displayName || user.email || 'User';
    if (elements.userAvatar && (user.displayName || user.email)) {
         elements.userAvatar.textContent = (user.displayName || user.email)[0].toUpperCase();
    } else if (elements.userAvatar) {
         elements.userAvatar.textContent = 'U';
    }

    if (elements.emailInput && user.email) {
         elements.emailInput.value = user.email;
    }

    await checkApplicationStatus(user);
}

function handleUnauthenticatedUser() {
    if (elements.loginBtn) elements.loginBtn.style.display = 'inline-flex';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'none';
    if (elements.userInfo) elements.userInfo.style.display = 'none';
    if (elements.startApplicationBtn) elements.startApplicationBtn.style.display = 'none';

    showSection('application');

    if (elements.dashboardSection) elements.dashboardSection.style.display = 'none';
    if (elements.applicationStatus) elements.applicationStatus.style.display = 'none';
    if (elements.existingApplication) elements.existingApplication.style.display = 'none';
}

async function submitApplicationWithPayment(e) {
    if (appState.isSubmitting) {
        showToast('Application is already being submitted. Please wait.', 'warning');
        return;
    }

    appState.isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    // Visual feedback that we are saving data first
    if (submitButton) updateButtonState(submitButton, true, 'Saving Data...');

    try {
        const rawFormData = await getApplicationData();
        if (!rawFormData) {
            throw new Error('Failed to retrieve form data.');
        }

        // --- CHANGE START ---
        // 1. Save data & upload files NOW (Safety Save)
        const savedData = await preSaveApplication(rawFormData);
        
        // 2. Update button text so user knows payment is next
        if (submitButton) updateButtonState(submitButton, true, 'Opening Payment...');

       
        const paymentSuccess = await showPaystackPaymentModal(savedData);

        if (paymentSuccess) {
            // Success is handled in payments.js callback
        } else {
            showToast('Application fee payment is required to submit.', 'warning');
            if (submitButton) updateButtonState(submitButton, false);
        }

    } catch (error) {
        console.error('Application submission error:', error);
        showToast(error.message || 'Error submitting application. Please try again.', 'error');
         if (submitButton) updateButtonState(submitButton, false);
    } finally {
        appState.isSubmitting = false;
    }
}

function initializeDashboardTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    if (tabButtons.length === 0 || tabPanes.length === 0) return;

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            tabPanes.forEach(pane => pane.classList.remove('active'));
            const activePane = document.getElementById(`${tabId}Tab`);
            if (activePane) {
                activePane.classList.add('active');
            }
        });
    });
}

function initializePaymentPlanDropdown() {
    const paymentPlanSelect = document.getElementById('paymentPlanSelect');
    if (!paymentPlanSelect) return;

    paymentPlanSelect.addEventListener('change', async (e) => {
        const selectedPlan = e.target.value;

        if (!selectedPlan) return;

        await withErrorHandling(async () => {
            const user = window.firebaseAuth.currentUser;
            if (!user) {
                showToast('Please sign in to select payment plan', 'error');
                paymentPlanSelect.value = '';
                return;
            }

            const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
            const docSnap = await window.firebaseGetDoc(appRef);

            if (docSnap.exists()) {
                const applicationData = docSnap.data();
                applicationData.id = user.uid;

                const confirmed = await showPaymentPlanConfirmationModal(applicationData, selectedPlan);

                if (!confirmed) {
                    paymentPlanSelect.value = applicationData.paymentPlan || '';
                    return;
                }

                await savePaymentPlan(applicationData.id, selectedPlan);

                showToast(`Payment plan set to ${getPlanDisplayName(selectedPlan)}`, 'success');

                if (window.loadDashboardData) {
                    await window.loadDashboardData(applicationData.id, false);
                }

            } else {
                 showToast('Application data not found. Cannot set payment plan.', 'error');
                 paymentPlanSelect.value = '';
            }
        }, 'Error selecting payment plan');
    });
}

async function savePaymentPlan(applicationId, paymentPlan) {
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    const updateData = {
        paymentPlan: paymentPlan,
        updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    };
    
    const docSnap = await window.firebaseGetDoc(appRef);
    if (docSnap.exists() && !docSnap.data().paymentStartDate) {
        updateData.paymentStartDate = new Date().toISOString();
    }

    await window.firebaseSetDoc(appRef, updateData, { merge: true });

    const paymentPlanSelectionDiv = document.querySelector('.payment-plan-selection');
    if (paymentPlanSelectionDiv) {
        paymentPlanSelectionDiv.style.display = 'none';
    }
    
    const paymentCardsDiv = document.querySelector('.payment-cards');
    if (paymentCardsDiv) {
        paymentCardsDiv.style.display = 'none';
    }
}

function getPlanDisplayName(paymentPlan) {
    const planNames = {
        'upfront': 'Upfront Payment',
        'sixMonths': '6 Months Installment',
        'tenMonths': '10 Months Installment'
    };
    return planNames[paymentPlan] || paymentPlan;
}

function initializeTuitionPayments() {
    const dashboardContent = document.getElementById('dashboardSection');
    if (!dashboardContent) return;

    dashboardContent.addEventListener('click', async (e) => {
        const payButton = e.target.closest('.payment-card .pay-tuition-btn');
        if (payButton) {
            const paymentPlan = payButton.getAttribute('data-plan');

            payButton.disabled = true;
            updateButtonState(payButton, true, 'Processing...');

            await withErrorHandling(async () => {
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    showToast('Please sign in to make payments', 'error');
                    updateButtonState(payButton, false);
                    return;
                }

                const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
                const docSnap = await window.firebaseGetDoc(appRef);

                if (docSnap.exists()) {
                    const applicationData = docSnap.data();
                    applicationData.id = user.uid;

                    if (applicationData.status !== 'approved') {
                         showToast('Application must be approved to make tuition payments.', 'warning');
                         updateButtonState(payButton, false);
                         return;
                    }

                    await savePaymentPlan(applicationData.id, paymentPlan);
                    applicationData.paymentPlan = paymentPlan;
                    
                    if (!applicationData.paymentStartDate) {
                        applicationData.paymentStartDate = new Date().toISOString();
                    }

                    await initiateTuitionPayment(applicationData, paymentPlan, null);

                } else {
                    showToast('Application data not found', 'error');
                    updateButtonState(payButton, false);
                }
            }, 'Error processing initial tuition payment', () => {
                 updateButtonState(payButton, false);
            });
        }
    });
}

function initializeMonthlyPayments() {
    const monthlyPaymentsContainer = document.getElementById('monthlyPayments');
    if (!monthlyPaymentsContainer) return;

    monthlyPaymentsContainer.addEventListener('click', async (e) => {
        const payButton = e.target.closest('.pay-month-btn:not(:disabled)');
        if (payButton) {
            const month = payButton.getAttribute('data-month');
            const paymentPlan = payButton.getAttribute('data-plan');

            payButton.disabled = true;
            updateButtonState(payButton, true, 'Processing...');

            await withErrorHandling(async () => {
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    showToast('Please sign in to make payments', 'error');
                    updateButtonState(payButton, false);
                    payButton.disabled = false;
                    return;
                }

                const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
                const docSnap = await window.firebaseGetDoc(appRef);

                if (docSnap.exists()) {
                    const applicationData = docSnap.data();
                    applicationData.id = user.uid;

                    if (applicationData.status !== 'approved') {
                         showToast('Application must be approved.', 'warning');
                         updateButtonState(payButton, false);
                         payButton.disabled = false;
                         return;
                    }

                    await initiateTuitionPayment(applicationData, paymentPlan, month);

                } else {
                    showToast('Application data not found', 'error');
                    updateButtonState(payButton, false);
                    payButton.disabled = false;
                }
            }, 'Error processing monthly payment', () => {
                 updateButtonState(payButton, false);
                 payButton.disabled = false;
            });
        }
    });
}

function setupCleanup() {
    window.addEventListener('beforeunload', () => {
        if (window.cleanupApplicationListener) {
            window.cleanupApplicationListener();
        }
    });
}

setupCleanup();

window.loadDashboardData = loadDashboardData;
window.setupApplicationListener = setupApplicationListener;
window.generateMonthlyPayments = generateMonthlyPayments;
window.checkAndHidePaymentPlan = checkAndHidePaymentPlan;

async function showPaymentPlanConfirmationModal(applicationData, paymentPlan) {
     return new Promise((resolve) => {
        let modal = document.getElementById('paymentPlanConfirmationModal');

        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'paymentPlanConfirmationModal';
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Confirm Payment Plan</h3>
                        <span class="close">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="payment-plan-confirmation">
                            <p><strong>Are you sure you want to select the <span id="confirmPlanName"></span> payment plan?</strong></p>
                            <div class="plan-details" id="confirmPlanDetails">
                                </div>
                            <p>Once confirmed, your payment options will update.</p>
                             <p><small>You can change your payment plan later if needed by contacting support.</small></p>
                            <div class="payment-security">
                                <i class="fas fa-info-circle"></i>
                                <span>This selection will be saved to your application.</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="confirmPlanSelection" class="btn btn-primary">
                            <i class="fas fa-check"></i> Confirm Plan
                        </button>
                        <button id="cancelPlanSelection" class="btn btn-secondary">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const confirmBtn = document.getElementById('confirmPlanSelection');
        const cancelBtn = document.getElementById('cancelPlanSelection');
        const closeBtn = modal.querySelector('.close');
        const planNameElement = document.getElementById('confirmPlanName');
        const planDetailsElement = document.getElementById('confirmPlanDetails');

        if (!confirmBtn || !cancelBtn || !closeBtn || !planNameElement || !planDetailsElement) {
            resolve(false);
            return;
        }

        const subjectCount = applicationData.selectedSubjects?.length || 0;
        const planDisplayName = getPlanDisplayName(paymentPlan);
        planNameElement.textContent = planDisplayName;

        let planDetails = '';
        if (paymentPlan === 'upfront') {
            const feeCalculation = calculateSubjectFees(subjectCount, paymentPlan);
            planDetails = `
                <div class="fee-breakdown">
                    <p><strong>Upfront Payment Details:</strong></p>
                    <p>Subjects: ${subjectCount}</p>
                    <p>Total Amount: <strong>R${feeCalculation.displayAmount}</strong></p>
                    <p class="savings-note">💡 Save R400 compared to 10-month plan</p>
                </div>
            `;
        } else {
            const monthlyCalculation = calculateMonthlyAmount(subjectCount, paymentPlan);
            const months = paymentPlan === 'sixMonths' ? 6 : 10;
            planDetails = `
                <div class="fee-breakdown">
                    <p><strong>${months}-Month Installment Plan:</strong></p>
                    <p>Subjects: ${subjectCount}</p>
                    <p>Monthly Payment: <strong>R${monthlyCalculation.monthlyDisplayAmount}</strong></p>
                    <p>Total Amount: <strong>R${monthlyCalculation.totalDisplayAmount}</strong></p>
                    <p>Number of Payments: ${months} months</p>
                </div>
            `;
        }
        planDetailsElement.innerHTML = planDetails;

        const modalRef = modal;
        const confirmBtnRef = confirmBtn;
        const cancelBtnRef = cancelBtn;
        const closeBtnRef = closeBtn;

        const handleConfirm = async () => {
            cleanupListeners();
            resolve(true);
        };

        const handleCancel = () => {
            cleanupListeners();
            resolve(false);
        };

        const handleModalClick = (e) => {
            if (e.target === modalRef) handleCancel();
        };

         const handleEscapeKey = (e) => {
             if (e.key === 'Escape' && modalRef.style.display === 'flex') {
                 handleCancel();
             }
         };

        const cleanupListeners = () => {
            confirmBtnRef.removeEventListener('click', handleConfirm);
            cancelBtnRef.removeEventListener('click', handleCancel);
            closeBtnRef.removeEventListener('click', handleCancel);
            modalRef.removeEventListener('click', handleModalClick);
            document.removeEventListener('keydown', handleEscapeKey);
            modalRef.style.display = 'none';
        };

        confirmBtnRef.addEventListener('click', handleConfirm, { once: true });
        cancelBtnRef.addEventListener('click', handleCancel, { once: true });
        closeBtnRef.addEventListener('click', handleCancel, { once: true });
        modalRef.addEventListener('click', handleModalClick);
        document.addEventListener('keydown', handleEscapeKey);

        modalRef.style.display = 'flex';
    });
}

function calculateSubjectFees(subjectCount, paymentPlan) {
    const FEE_STRUCTURE_LOCAL = {
        subjects: {
            1: { upfront: 140000, sixMonths: 160000, tenMonths: 200000 },
            2: { upfront: 210000, sixMonths: 230000, tenMonths: 250000 },
            3: { upfront: 330000, sixMonths: 360000, tenMonths: 380000 },
            4: { upfront: 410000, sixMonths: 430000, tenMonths: 450000 }
        }
    };
    const count = Math.min(Math.max(subjectCount, 1), 4);
    const fees = FEE_STRUCTURE_LOCAL.subjects[count];
    if (!fees || !fees[paymentPlan]) {
         return { amount: 0, displayAmount: '0.00' };
    }
    return {
        amount: fees[paymentPlan],
        displayAmount: (fees[paymentPlan] / 100).toFixed(2)
    };
}

function calculateMonthlyAmount(subjectCount, paymentPlan) {
    const total = calculateSubjectFees(subjectCount, paymentPlan);
    if (total.amount === 0) return { monthlyAmount: 0, monthlyDisplayAmount: '0.00', totalAmount: 0, totalDisplayAmount: '0.00'};
    const months = paymentPlan === 'sixMonths' ? 6 : (paymentPlan === 'tenMonths' ? 10 : 1);
    if (months === 1) return { monthlyAmount: total.amount, monthlyDisplayAmount: total.displayAmount, totalAmount: total.amount, totalDisplayAmount: total.displayAmount };
    const monthlyRaw = total.amount / months;
    const monthlyAmountCents = Math.ceil(monthlyRaw);
    return {
        monthlyAmount: monthlyAmountCents,
        monthlyDisplayAmount: (monthlyAmountCents / 100).toFixed(2),
        totalAmount: total.amount,
        totalDisplayAmount: total.displayAmount
    };
}

async function requestNotificationPermissionAndSaveToken() {
    if (!('Notification' in window) || !window.firebaseMessaging || !window.firebaseGetToken) {
        return;
    }
    const messaging = window.firebaseMessaging;
    const getTokenFunc = window.firebaseGetToken;
    const user = window.firebaseAuth.currentUser;
    if (!user) return;

    try {
        const currentPermission = Notification.permission;

        if (currentPermission === 'granted') {
            await getAndSaveToken(messaging, getTokenFunc, user.uid);
        } else if (currentPermission === 'denied') {
            // Permission was previously denied
        } else {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await getAndSaveToken(messaging, getTokenFunc, user.uid);
                showToast('Payment reminder notifications enabled!', 'success');
            } else {
                showToast('You chose not to enable payment reminder notifications.', 'info');
            }
        }
    } catch (error) {
        console.error('Error handling notification permission/token:', error);
        showToast('Could not set up notifications: ' + error.message, 'error');
    }
}

async function getAndSaveToken(messaging, getTokenFunc, userId) {
    try {
        const vapidKey = "BMkFXLQqoZLBb_08oQt5wE8g-1GOTu0fQAUElUCCRPZf5P77te1ACxKeCRgH_w1YBlQUJPj2prYsCREVkx4Ethw";

        const registration = await navigator.serviceWorker.ready;

        const currentToken = await getTokenFunc(messaging, {
             vapidKey: vapidKey,
             serviceWorkerRegistration: registration
         });

        if (currentToken) {
            const userDocRef = window.firebaseDoc(window.firebaseDb, 'applications', userId);
            await window.firebaseUpdateDoc(userDocRef, {
                pushTokens: window.firebaseArrayUnion(currentToken),
                updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            });
        } else {
            showToast('Could not get notification token. Permission issue?', 'warning');
        }
    } catch (error) {
        console.error('Error retrieving or saving the FCM token:', error);
        if (error.code === 'messaging/notifications-blocked') {
             showToast('Notifications are blocked by the browser or OS.', 'warning');
        } else if (error.name === 'AbortError') {
             showToast('Could not subscribe for notifications. Service worker issue?', 'error');
        } else {
            showToast('Error getting/saving notification token: ' + error.message, 'error');
        }
    }
}

export { requestNotificationPermissionAndSaveToken };
