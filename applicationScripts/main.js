// main.js

import { elements, subjects } from './constants.js';
import { signInWithGoogle, doLogout } from './auth.js';
import { showSection, updateSubjects,updateButtonState } from './ui.js';
import { submitApplication, initializeFormNavigation, getApplicationData } from './form.js';
import { initializeSignaturePads, clearSignature, clearLearnerSignature, clearParentSignaturePledge } from './signature.js';
import { handleFileUpload, handleFileDrop } from './storage.js';
import { checkApplicationStatus, handlePaymentReturn, loadDashboardData, setupApplicationListener } from './database.js';
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
        // Check for payment return first
        await handlePaymentReturn();

        // Create and setup spinner
        createLoadingSpinner();

        // Initialize all components
        await initializeComponents();

        // Setup event listeners
        setupEventListeners();

        // Setup auto-save
        setupAutoSaveFeatures();

        console.log('Application initialized successfully');

    } catch (error) {
        console.error('Application initialization failed:', error);
        showToast('Failed to initialize application. Please refresh the page.', 'error');
    }
}

function createLoadingSpinner() {
    // Check if spinner already exists
    let spinner = document.querySelector('.loading-spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.display = 'none'; // Initially hidden
        spinner.innerHTML = '<i class="fas fa-spinner fa-spin fa-2x"></i> Submitting...';
        spinner.setAttribute('aria-live', 'polite');
        spinner.setAttribute('aria-busy', 'false'); // Initially not busy

        // Append to a reliable element, like the form container or body
        const formContainer = document.querySelector('.form-container') || document.body;
        formContainer.appendChild(spinner);

    } else {
        // Ensure it's hidden initially if it already exists
         spinner.style.display = 'none';
         spinner.setAttribute('aria-busy', 'false');
    }
}


async function initializeComponents() {
    // Initialize signature pads
    initializeSignaturePads();

    // Initialize form navigation
    initializeFormNavigation();

    // Initialize dashboard functionality
    initializeDashboardTabs();
    initializeTuitionPayments();
    initializeMonthlyPayments();
    initializePaymentPlanDropdown();

    // Check user authentication and application status
    await setupAuthListener();

    // Set current year in footer
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }

    // Initialize subjects based on default or potentially loaded grade
    updateSubjects(elements.gradeSelect?.value || '8');
}

function setupEventListeners() {
    // Authentication
    if (elements.loginBtn) elements.loginBtn.addEventListener('click', signInWithGoogle);
    elements.logoutBtn.addEventListener('click', doLogout);
    elements.startApplicationBtn.addEventListener('click', () => showSection('application'));

    // Form submission with enhanced error handling
    elements.pledgeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await withErrorHandling(
            () => submitApplicationWithPayment(e),
            'Error submitting application'
        );
    });

    // File uploads
    setupFileUploadListeners();

    // Form navigation and progress tracking
    setupFormNavigationListeners();

    // Support button
    elements.contactSupportBtn.addEventListener('click', () => {
        showToast('Please contact support at info@alusaniacademy.edu.za', 'info');
    });

    // --- ADDED: Temporary button for manual notification permission ---
    const enableBtn = document.getElementById('enableNotificationsBtn');
    if (enableBtn) {
        enableBtn.addEventListener('click', async () => {
            console.log('Manual notification permission request clicked...');
            await requestNotificationPermissionAndSaveToken();
        });
    }
    // -----------------------------------------------------------------
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


    // Enhanced file upload areas with accessibility and drag/drop
    [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
        if (!uploadArea) return; // Skip if element doesn't exist

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
             e.preventDefault(); // Needed for Firefox sometimes
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', debounce((e) => handleFileDrop(e, uploadArea), 300));
    });
}

function setupFormNavigationListeners() {
    // Grade change updates subjects
    if (elements.gradeSelect) {
        elements.gradeSelect.addEventListener('change', (e) => updateSubjects(e.target.value));
    }

    // Signature clear buttons
    if (elements.clearSignature) elements.clearSignature.addEventListener('click', clearSignature);
    if (elements.clearLearnerSignature) elements.clearLearnerSignature.addEventListener('click', clearLearnerSignature);
    if (elements.clearParentSignaturePledge) elements.clearParentSignaturePledge.addEventListener('click', clearParentSignaturePledge);
}

function setupAutoSaveFeatures() {
    // Setup auto-save for each form section
    const forms = {
        application: elements.applicationForm,
        consent: elements.consentForm,
        rules: document.querySelector('#rulesSection form'), // Assuming rules has a form for checkbox
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
            // Use the spinner created earlier
            const spinner = document.querySelector('.loading-spinner');

            await withErrorHandling(async () => {
                if (spinner) {
                    spinner.style.display = 'flex'; // Show spinner during auth check
                    spinner.setAttribute('aria-busy', 'true');
                }

                if (user) {
                    await handleAuthenticatedUser(user);
                } else {
                    handleUnauthenticatedUser();
                }
            }, 'Error during authentication state change');

            if (spinner) {
                spinner.style.display = 'none'; // Hide spinner after check
                spinner.setAttribute('aria-busy', 'false');
            }
        });
    } else {
         console.error("Firebase Auth or onAuthStateChanged not available.");
         showToast("Authentication service failed to load.", "error");
         handleUnauthenticatedUser(); // Ensure UI reflects logged-out state
    }
}


async function handleAuthenticatedUser(user) {
    // Update UI for authenticated user
    if (elements.loginBtn) elements.loginBtn.style.display = 'none';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'inline-flex';
    if (elements.userInfo) elements.userInfo.style.display = 'flex';
    if (elements.userName) elements.userName.textContent = user.displayName || user.email || 'User';
    if (elements.userAvatar && (user.displayName || user.email)) {
         elements.userAvatar.textContent = (user.displayName || user.email)[0].toUpperCase();
    } else if (elements.userAvatar) {
         elements.userAvatar.textContent = 'U'; // Default avatar
    }

    // Pre-fill email if available and element exists
    if (elements.emailInput && user.email) {
         elements.emailInput.value = user.email;
         // Optionally make it read-only if it shouldn't be changed
         // elements.emailInput.readOnly = true;
    }


    // Check application status with real-time updates enabled
    console.log('Checking application status...');
    const appData = await checkApplicationStatus(user); // checkApplicationStatus now handles loading dashboard
    console.log('checkApplicationStatus returned:', appData);

    // --- Request notification permission AFTER dashboard/app data is confirmed ---
    // This logic is now primarily handled within loadDashboardData in database.js
    // We keep a fallback here just in case, but it might be redundant.
    // if (appData) {
    //     console.log('App data exists, attempting permission request (may already happen in loadDashboardData)...');
    //     await requestNotificationPermissionAndSaveToken();
    // } else {
    //      console.log('No appData after check, skipping notification permission request in main.js.');
    // }
}

function handleUnauthenticatedUser() {
    // Update UI for unauthenticated user
    if (elements.loginBtn) elements.loginBtn.style.display = 'inline-flex';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'none';
    if (elements.userInfo) elements.userInfo.style.display = 'none';
    if (elements.startApplicationBtn) elements.startApplicationBtn.style.display = 'none'; // Hide start button when logged out

    // Ensure dashboard and status sections are hidden, show application form section
    showSection('application'); // Redirects to application form view

    // Explicitly hide sections that might persist
    if (elements.dashboardSection) elements.dashboardSection.style.display = 'none';
    if (elements.applicationStatus) elements.applicationStatus.style.display = 'none';
    if (elements.existingApplication) elements.existingApplication.style.display = 'none';

    // Optional: Clear any potentially sensitive form fields if needed
    // resetForms(); // Consider if this is desired on logout
}

// Enhanced application submission with payment
async function submitApplicationWithPayment(e) {
    if (appState.isSubmitting) {
        showToast('Application is already being submitted. Please wait.', 'warning');
        return;
    }

    appState.isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]'); // Get the submit button
    if (submitButton) updateButtonState(submitButton, true, 'Submitting...'); // Show loading state on button

    try {
        // 1. Get and validate application data from all form sections
        const applicationData = await getApplicationData(); // Assumes getApplicationData collects from all sections
        if (!applicationData) {
            throw new Error('Failed to retrieve form data.');
        }

        // 2. Perform comprehensive validation (if getApplicationData doesn't already do it)
        // You might need separate validation functions for each part as in form.js
        // const errors = validateAllSections(applicationData);
        // if (errors.length > 0) {
        //    showToast(`Please fix errors: ${errors[0]}`, 'error');
        //    throw new Error('Form validation failed.');
        // }

        // 3. Show Paystack modal for the compulsory application fee
        const paymentSuccess = await showPaystackPaymentModal(applicationData);

        // 4. Handle payment result
        if (paymentSuccess) {
            // Payment was successful, proceed with final submission steps
            // Note: completeApplicationSubmission is now called *within* the Paystack callback in payments.js
            // So we might not need to do much more here, just wait for the callback process.
            console.log('Payment initiated successfully. Waiting for callback handler...');
            // The button state will be reset by the callback handler or finally block
        } else {
            // Payment was cancelled or failed to initiate
            showToast('Application fee payment is required to submit.', 'warning');
            // Reset button state immediately if payment didn't even start
             if (submitButton) updateButtonState(submitButton, false);
        }

    } catch (error) {
        console.error('Application submission error:', error);
        showToast(error.message || 'Error submitting application. Please try again.', 'error');
         if (submitButton) updateButtonState(submitButton, false); // Reset button state on error
    } finally {
        // Ensure submitting state is reset, though button state might be handled elsewhere
        appState.isSubmitting = false;
        // The button state reset might happen in the Paystack callback/onClose or here if needed.
        // It's generally better handled within the specific flow (success/cancel/error).
    }
}


// Initialize dashboard tabs
function initializeDashboardTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    if (tabButtons.length === 0 || tabPanes.length === 0) return; // Don't run if dashboard elements aren't present

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show active tab pane
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const activePane = document.getElementById(`${tabId}Tab`);
            if (activePane) {
                activePane.classList.add('active');
            } else {
                 console.warn(`Tab pane with ID ${tabId}Tab not found.`);
            }
        });
    });
}

// Initialize payment plan dropdown
function initializePaymentPlanDropdown() {
    const paymentPlanSelect = document.getElementById('paymentPlanSelect');
    if (!paymentPlanSelect) return;

    paymentPlanSelect.addEventListener('change', async (e) => {
        const selectedPlan = e.target.value;

        if (!selectedPlan) return; // Ignore selection if "Select Payment Plan" is chosen

        await withErrorHandling(async () => {
            const user = window.firebaseAuth.currentUser;
            if (!user) {
                showToast('Please sign in to select payment plan', 'error');
                paymentPlanSelect.value = ''; // Reset selection
                return;
            }

            // Get current application data to pass to modal and save function
            const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
            const docSnap = await window.firebaseGetDoc(appRef);

            if (docSnap.exists()) {
                const applicationData = docSnap.data();
                applicationData.id = user.uid; // Ensure ID is attached

                // Show confirmation modal before saving
                const confirmed = await showPaymentPlanConfirmationModal(applicationData, selectedPlan);

                if (!confirmed) {
                    // User cancelled - Reset dropdown to previously saved plan or default
                    paymentPlanSelect.value = applicationData.paymentPlan || '';
                    return;
                }

                // User confirmed - Save payment plan to Firestore
                await savePaymentPlan(applicationData.id, selectedPlan);

                // Update local application data state (if you maintain one globally) or refetch
                // For simplicity, we'll rely on loadDashboardData to refresh UI

                showToast(`Payment plan set to ${getPlanDisplayName(selectedPlan)}`, 'success');

                // Refresh the dashboard UI to reflect the change
                if (window.loadDashboardData) {
                    // Call loadDashboardData again, but prevent re-attaching listener if already active
                    await window.loadDashboardData(applicationData.id, false); // Pass false to skip re-attaching listener
                }

            } else {
                 showToast('Application data not found. Cannot set payment plan.', 'error');
                 paymentPlanSelect.value = ''; // Reset selection
            }
        }, 'Error selecting payment plan');
    });
}

// Save payment plan to database (also updates start date if needed)
async function savePaymentPlan(applicationId, paymentPlan) {
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    const updateData = {
        paymentPlan: paymentPlan,
        updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    };
    // Only set paymentStartDate if it doesn't already exist to anchor the schedule
    const docSnap = await window.firebaseGetDoc(appRef);
    if (docSnap.exists() && !docSnap.data().paymentStartDate) {
        updateData.paymentStartDate = new Date().toISOString();
        console.log('Setting paymentStartDate for the first time.');
    } else {
         console.log('paymentStartDate already exists or document not found.');
    }


    await window.firebaseSetDoc(appRef, updateData, { merge: true });
    console.log(`Payment plan ${paymentPlan} saved for application ${applicationId}.`);

    // Hide the dropdown selector UI element after successful save
    const paymentPlanSelectionDiv = document.querySelector('.payment-plan-selection');
    if (paymentPlanSelectionDiv) {
        paymentPlanSelectionDiv.style.display = 'none';
    }
     // Also hide the initial payment cards if they were visible
     const paymentCardsDiv = document.querySelector('.payment-cards');
     if (paymentCardsDiv) {
         paymentCardsDiv.style.display = 'none';
     }
}

// Get display name for payment plan
function getPlanDisplayName(paymentPlan) {
    const planNames = {
        'upfront': 'Upfront Payment',
        'sixMonths': '6 Months Installment',
        'tenMonths': '10 Months Installment'
    };
    return planNames[paymentPlan] || paymentPlan;
}

// Initialize tuition payment buttons (for upfront/start installments)
function initializeTuitionPayments() {
    // Use event delegation on a parent container
    const dashboardContent = document.getElementById('dashboardSection'); // Or a closer parent if possible
    if (!dashboardContent) return;

    dashboardContent.addEventListener('click', async (e) => {
        // Target only buttons within the payment cards
        const payButton = e.target.closest('.payment-card .pay-tuition-btn');
        if (payButton) {
            const paymentPlan = payButton.getAttribute('data-plan');
            console.log(`Initial pay button clicked for plan: ${paymentPlan}`);

            // Disable button immediately
            payButton.disabled = true;
            updateButtonState(payButton, true, 'Processing...');

            await withErrorHandling(async () => {
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    showToast('Please sign in to make payments', 'error');
                    updateButtonState(payButton, false); // Re-enable
                    return;
                }

                // Get application data
                const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
                const docSnap = await window.firebaseGetDoc(appRef);

                if (docSnap.exists()) {
                    const applicationData = docSnap.data();
                    applicationData.id = user.uid; // Add ID

                    // Check if approved
                    if (applicationData.status !== 'approved') {
                         showToast('Application must be approved to make tuition payments.', 'warning');
                         updateButtonState(payButton, false); // Re-enable
                         return;
                    }

                    // --- Action: Save the plan and Initiate Payment ---
                    // 1. Save the selected payment plan
                    await savePaymentPlan(applicationData.id, paymentPlan);
                    applicationData.paymentPlan = paymentPlan; // Update local copy
                     // Ensure start date is set locally if savePaymentPlan added it
                    if (!applicationData.paymentStartDate) {
                        applicationData.paymentStartDate = new Date().toISOString();
                    }

                    // 2. Initiate the corresponding payment (first installment or full upfront)
                    console.log('Initiating first/upfront payment for plan:', paymentPlan);
                    await initiateTuitionPayment(applicationData, paymentPlan, null); // Pass null for month initially

                    // Note: Button state (success/fail) will be handled by Paystack callback/onClose

                } else {
                    showToast('Application data not found', 'error');
                    updateButtonState(payButton, false); // Re-enable
                }
            }, 'Error processing initial tuition payment', () => {
                 // Error handler: Re-enable button on failure
                 updateButtonState(payButton, false);
            });
        }
    });
}


// Initialize monthly payment buttons (delegated)
function initializeMonthlyPayments() {
    // Use event delegation on the container for monthly payments
    const monthlyPaymentsContainer = document.getElementById('monthlyPayments');
    if (!monthlyPaymentsContainer) return;

    monthlyPaymentsContainer.addEventListener('click', async (e) => {
        // Target only enabled monthly payment buttons
        const payButton = e.target.closest('.pay-month-btn:not(:disabled)');
        if (payButton) {
            const month = payButton.getAttribute('data-month');
            const paymentPlan = payButton.getAttribute('data-plan');

            console.log('Monthly payment button clicked:', { month, paymentPlan });

            // Disable button immediately
            payButton.disabled = true;
            updateButtonState(payButton, true, 'Processing...'); // Show spinner

            await withErrorHandling(async () => {
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    showToast('Please sign in to make payments', 'error');
                    updateButtonState(payButton, false); // Re-enable
                    payButton.disabled = false;
                    return;
                }

                // Get application data
                const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
                const docSnap = await window.firebaseGetDoc(appRef);

                if (docSnap.exists()) {
                    const applicationData = docSnap.data();
                    applicationData.id = user.uid; // Add ID

                    // Double-check approval (should be covered by button state, but safe)
                    if (applicationData.status !== 'approved') {
                         showToast('Application must be approved.', 'warning');
                         updateButtonState(payButton, false); // Re-enable
                         payButton.disabled = false; // Just in case
                         return;
                    }

                    // Initiate the payment for the specific month
                    console.log('Initiating monthly payment for:', month);
                    await initiateTuitionPayment(applicationData, paymentPlan, month); // Pass the month name

                    // Note: Button state reset (success/fail) is handled by Paystack callback/onClose
                } else {
                    showToast('Application data not found', 'error');
                    updateButtonState(payButton, false); // Re-enable
                    payButton.disabled = false;
                }
            }, 'Error processing monthly payment', () => {
                 // Error handler: Re-enable button on failure
                 updateButtonState(payButton, false);
                 payButton.disabled = false; // Ensure it's re-enabled
            });
        }
    });
}

// Cleanup function for page unload (Optional, less critical now)
function setupCleanup() {
    window.addEventListener('beforeunload', () => {
        // If using real-time listeners, ensure they are cleaned up
        if (window.cleanupApplicationListener) {
            window.cleanupApplicationListener();
        }
        console.log('Cleaning up application before unload.');
    });
}

// Initialize cleanup on load
setupCleanup();

// Make functions available globally if absolutely needed by HTML onclick or older scripts
window.loadDashboardData = loadDashboardData;
window.setupApplicationListener = setupApplicationListener;
window.generateMonthlyPayments = generateMonthlyPayments;
window.checkAndHidePaymentPlan = checkAndHidePaymentPlan;

// Payment Plan Confirmation Modal Function (Keep definition local or move to ui.js if preferred)
async function showPaymentPlanConfirmationModal(applicationData, paymentPlan) {
     // ... (Implementation remains the same as provided previously) ...
     return new Promise((resolve) => {
        // Create modal if it doesn't exist
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
            console.error('Payment plan confirmation modal elements not found');
            resolve(false);
            return;
        }

        // Update modal content based on selected plan
        const subjectCount = applicationData.selectedSubjects?.length || 0;
        const planDisplayName = getPlanDisplayName(paymentPlan);
        planNameElement.textContent = planDisplayName;

        // Calculate and display plan details
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

        // Use captured references for event listeners
        const modalRef = modal;
        const confirmBtnRef = confirmBtn;
        const cancelBtnRef = cancelBtn;
        const closeBtnRef = closeBtn;

        // Define handlers within scope
        const handleConfirm = async () => {
            cleanupListeners(); // Clean up immediately
            resolve(true);
        };

        const handleCancel = () => {
            cleanupListeners(); // Clean up immediately
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
            // Hide modal explicitly here
            modalRef.style.display = 'none';
        };

        // Add event listeners
        confirmBtnRef.addEventListener('click', handleConfirm, { once: true }); // Use once if appropriate
        cancelBtnRef.addEventListener('click', handleCancel, { once: true });
        closeBtnRef.addEventListener('click', handleCancel, { once: true });
        modalRef.addEventListener('click', handleModalClick);
        document.addEventListener('keydown', handleEscapeKey);

        // Show the modal
        modalRef.style.display = 'flex';
    });
}

// Helper functions for fee calculations (needed locally for the modal)
function calculateSubjectFees(subjectCount, paymentPlan) {
    const FEE_STRUCTURE_LOCAL = {
        subjects: {
            1: { upfront: 110000, sixMonths: 130000, tenMonths: 150000 },
            2: { upfront: 210000, sixMonths: 230000, tenMonths: 250000 },
            3: { upfront: 310000, sixMonths: 330000, tenMonths: 350000 },
            4: { upfront: 410000, sixMonths: 430000, tenMonths: 450000 }
        }
    };
    const count = Math.min(Math.max(subjectCount, 1), 4);
    const fees = FEE_STRUCTURE_LOCAL.subjects[count];
    if (!fees || !fees[paymentPlan]) {
         console.error(`Fee structure not found for ${count} subjects, plan ${paymentPlan}`);
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
    const monthlyAmountCents = Math.ceil(monthlyRaw); // Use ceil for cents
    return {
        monthlyAmount: monthlyAmountCents,
        monthlyDisplayAmount: (monthlyAmountCents / 100).toFixed(2),
        totalAmount: total.amount,
        totalDisplayAmount: total.displayAmount
    };
}


// --- Notification Permission Functions ---
async function requestNotificationPermissionAndSaveToken() {
    if (!('Notification' in window) || !window.firebaseMessaging || !window.firebaseGetToken) {
        console.warn('Push Notifications are not supported/initialized.');
        return;
    }
    const messaging = window.firebaseMessaging;
    const getTokenFunc = window.firebaseGetToken;
    const user = window.firebaseAuth.currentUser;
    if (!user) return; // Need user

    try {
        const currentPermission = Notification.permission;
        console.log('Current notification permission:', currentPermission);

        if (currentPermission === 'granted') {
            await getAndSaveToken(messaging, getTokenFunc, user.uid);
        } else if (currentPermission === 'denied') {
            console.warn('Notification permission was previously denied.');
        } else {
            console.log('Requesting notification permission...');
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notification permission granted!');
                await getAndSaveToken(messaging, getTokenFunc, user.uid);
                showToast('Payment reminder notifications enabled!', 'success');
            } else {
                console.warn('Notification permission denied.');
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

        // --- Wait for Service Worker ---
        console.log('Waiting for service worker to become active...');
        const registration = await navigator.serviceWorker.ready;
        console.log('Service worker is active:', registration.active);
        // -----------------------------

        console.log('Attempting to get FCM token...');
        const currentToken = await getTokenFunc(messaging, {
             vapidKey: vapidKey,
             // --- Pass Registration ---
             serviceWorkerRegistration: registration
             // -------------------------
         });

        if (currentToken) {
            console.log('Obtained FCM Token:', currentToken);
            const userDocRef = window.firebaseDoc(window.firebaseDb, 'applications', userId);
            console.log(`Saving token to Firestore for user: ${userId}`);
            await window.firebaseUpdateDoc(userDocRef, {
                pushTokens: window.firebaseArrayUnion(currentToken),
                updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            });
            console.log('FCM token saved/updated successfully.');
        } else {
            console.warn('No registration token available after service worker ready.');
            showToast('Could not get notification token. Permission issue?', 'warning');
        }
    } catch (error) {
        console.error('An error occurred while retrieving or saving the FCM token:', error);
        if (error.code === 'messaging/notifications-blocked') {
             showToast('Notifications are blocked by the browser or OS.', 'warning');
        } else if (error.name === 'AbortError') {
             showToast('Could not subscribe for notifications. Service worker issue?', 'error');
        } else {
            showToast('Error getting/saving notification token: ' + error.message, 'error');
        }
    }
}

// --- Export necessary functions ---
// Export if needed by other modules, otherwise keep local
export { requestNotificationPermissionAndSaveToken };