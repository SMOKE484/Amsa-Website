import { elements, subjects } from './constants.js';
import { signInWithGoogle, doLogout } from './auth.js';
import { showSection, updateSubjects } from './ui.js';
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
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.display = 'none';
    spinner.innerHTML = '<i class="fas fa-spinner fa-spin fa-2x"></i> Submitting...';
    spinner.setAttribute('aria-live', 'polite');
    spinner.setAttribute('aria-busy', 'true');
    
    if (elements.applicationSection) {
        elements.applicationSection.appendChild(spinner);
    } else {
        console.error('applicationSection not found');
        showToast('Application error: Application section not found.', 'error');
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
    
    // Initialize subjects
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
}

function setupFileUploadListeners() {
    elements.reportCardUpload.addEventListener('click', () => elements.reportCard.click());
    elements.reportCard.addEventListener('change', debounce((e) => handleFileUpload(e, 'reportCard'), 300));
    
    elements.idDocumentUpload.addEventListener('click', () => elements.idDocument.click());
    elements.idDocument.addEventListener('change', debounce((e) => handleFileUpload(e, 'idDocument'), 300));
    
    // Enhanced file upload areas with accessibility
    [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
        uploadArea.setAttribute('tabindex', '0');
        uploadArea.setAttribute('role', 'button');
        uploadArea.setAttribute('aria-label', `Upload ${uploadArea.id.includes('report') ? 'report card' : 'ID document'}`);
        
        uploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                uploadArea.id === 'reportCardUpload' ? elements.reportCard.click() : elements.idDocument.click();
            }
        });
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
        
        uploadArea.addEventListener('drop', debounce((e) => handleFileDrop(e, uploadArea), 300));
    });
}

function setupFormNavigationListeners() {
    // Grade change updates subjects
    elements.gradeSelect.addEventListener('change', (e) => updateSubjects(e.target.value));
    
    // Signature clear buttons
    elements.clearSignature.addEventListener('click', clearSignature);
    elements.clearLearnerSignature.addEventListener('click', clearLearnerSignature);
    elements.clearParentSignaturePledge.addEventListener('click', clearParentSignaturePledge);
}

function setupAutoSaveFeatures() {
    // Setup auto-save for each form section
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
    if (window.firebaseAuth) {
        window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
            const spinner = elements.applicationSection?.querySelector('.loading-spinner');
            
            await withErrorHandling(async () => {
                if (spinner) {
                    spinner.style.display = 'block';
                    spinner.setAttribute('aria-busy', 'true');
                }
                
                if (user) {
                    await handleAuthenticatedUser(user);
                } else {
                    handleUnauthenticatedUser();
                }
            }, 'Error during authentication');
            
            if (spinner) {
                spinner.style.display = 'none';
                spinner.setAttribute('aria-busy', 'false');
            }
        });
    }
}

async function handleAuthenticatedUser(user) {
    // Update UI for authenticated user
    if (elements.loginBtn) elements.loginBtn.style.display = 'none';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'inline-flex';
    if (elements.userInfo) elements.userInfo.style.display = 'flex';
    if (elements.userName) elements.userName.textContent = user.displayName || user.email;
    if (elements.userAvatar) elements.userAvatar.textContent = (user.displayName || user.email)[0].toUpperCase();
    if (elements.emailInput) elements.emailInput.value = user.email;
    
    // Check application status with real-time updates enabled
    await checkApplicationStatus(user);
}

function handleUnauthenticatedUser() {
    // Update UI for unauthenticated user
    if (elements.loginBtn) elements.loginBtn.style.display = 'inline-flex';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'none';
    if (elements.userInfo) elements.userInfo.style.display = 'none';
    if (elements.startApplicationBtn) elements.startApplicationBtn.style.display = 'none';
    
    showSection('application');
    if (elements.applicationStatus) elements.applicationStatus.style.display = 'none';
    if (elements.existingApplication) elements.existingApplication.style.display = 'none';
}

// Enhanced application submission with payment
async function submitApplicationWithPayment(e) {
    if (appState.isSubmitting) {
        showToast('Application is already being submitted. Please wait.', 'warning');
        return;
    }
    
    appState.isSubmitting = true;
    
    try {
        // Get and validate application data
        const applicationData = await getApplicationData();
        
        if (!applicationData) {
            throw new Error('Failed to get application data');
        }
        
        // Show Paystack payment modal
        const paymentSuccess = await showPaystackPaymentModal(applicationData);
        
        if (!paymentSuccess) {
            showToast('Payment was cancelled. Please complete payment to submit your application.', 'warning');
        }
        
    } catch (error) {
        console.error('Application submission error:', error);
        showToast(error.message || 'Error submitting application. Please try again.', 'error');
    } finally {
        appState.isSubmitting = false;
    }
}

// Initialize dashboard tabs
function initializeDashboardTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
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
            }
        });
    });
}

// Initialize payment plan dropdown - UPDATED WITH CONFIRMATION
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
                paymentPlanSelect.value = ''; // Reset selection
                return;
            }
            
            // Get application data
            const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
            const docSnap = await window.firebaseGetDoc(appRef);
            
            if (docSnap.exists()) {
                const applicationData = docSnap.data();
                applicationData.id = user.uid;
                
                // Show confirmation modal
                const confirmed = await showPaymentPlanConfirmationModal(applicationData, selectedPlan);
                
                if (!confirmed) {
                    // Reset selection if cancelled
                    paymentPlanSelect.value = '';
                    return;
                }
                
                // Save payment plan and hide dropdown
                await savePaymentPlan(applicationData.id, selectedPlan);
                
                // Update application data
                applicationData.paymentPlan = selectedPlan;
                
                // Generate monthly payments if installment plan
                if (selectedPlan !== 'upfront') {
                    generateMonthlyPayments(applicationData, selectedPlan);
                } else {
                    // Hide monthly payments for upfront plan and show payment button
                    const monthlyPaymentsContainer = document.getElementById('monthlyPayments');
                    if (monthlyPaymentsContainer) {
                        monthlyPaymentsContainer.style.display = 'none';
                    }
                }
                
                showToast(`Payment plan set to ${getPlanDisplayName(selectedPlan)}`, 'success');
                
                // Refresh dashboard
                if (window.loadDashboardData) {
                    window.loadDashboardData(applicationData.id);
                }
            }
        }, 'Error selecting payment plan');
    });
}

// Save payment plan to database
async function savePaymentPlan(applicationId, paymentPlan) {
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    await window.firebaseSetDoc(appRef, {
        paymentPlan: paymentPlan,
        updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    }, { merge: true });
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

// Initialize tuition payment buttons
function initializeTuitionPayments() {
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('pay-tuition-btn')) {
            const paymentPlan = e.target.getAttribute('data-plan');
            
            await withErrorHandling(async () => {
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    showToast('Please sign in to make payments', 'error');
                    return;
                }
                
                // Get application data
                const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
                const docSnap = await window.firebaseGetDoc(appRef);
                
                if (docSnap.exists()) {
                    const applicationData = docSnap.data();
                    applicationData.id = user.uid;
                    
                    // TEMPORARY: Allow payments even if not approved for testing
                    // Remove this in production
                    applicationData.status = applicationData.status || 'approved';
                    
                    // DEBUG: Log what's being passed to initiateTuitionPayment
                    console.log('Calling initiateTuitionPayment with:', {
                        applicationData: applicationData.id,
                        paymentPlan,
                        month: null
                    });
                    
                    // Initiate tuition payment
                    await initiateTuitionPayment(applicationData, paymentPlan);
                } else {
                    showToast('Application data not found', 'error');
                }
            }, 'Error processing tuition payment');
        }
    });
}

// Initialize monthly payment buttons - FIXED VERSION
function initializeMonthlyPayments() {
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('pay-month-btn') && !e.target.disabled) {
            const month = e.target.getAttribute('data-month');
            const paymentPlan = e.target.getAttribute('data-plan');
            
            console.log('Monthly payment clicked:', { month, paymentPlan });
            
            // SAFETY CHECK: Immediately disable the button to prevent double clicks
            e.target.disabled = true;
            e.target.textContent = 'Processing...';
            
            await withErrorHandling(async () => {
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    showToast('Please sign in to make payments', 'error');
                    // Re-enable button if not authenticated
                    e.target.disabled = false;
                    e.target.textContent = 'Pay Now';
                    return;
                }
                
                // Get application data
                const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
                const docSnap = await window.firebaseGetDoc(appRef);
                
                if (docSnap.exists()) {
                    const applicationData = docSnap.data();
                    applicationData.id = user.uid;
                    
                    // Check if this month is already paid (double-check)
                    const monthKey = month.toLowerCase().replace(/ /g, '_');
                    if (applicationData.payments && applicationData.payments[monthKey]?.paid) {
                        showToast(`${month} is already paid`, 'warning');
                        // Button should already be disabled by CSS, but ensure it
                        e.target.disabled = true;
                        e.target.textContent = '✓ Paid';
                        e.target.classList.remove('btn-primary');
                        e.target.classList.add('btn-success');
                        return;
                    }
                    
                    // TEMPORARY: Allow payments even if not approved for testing
                    applicationData.status = applicationData.status || 'approved';
                    
                    console.log('Calling initiateTuitionPayment with:', {
                        applicationData: applicationData.id,
                        paymentPlan,
                        month
                    });
                    
                    // Initiate monthly payment - ensure month is passed correctly
                    await initiateTuitionPayment(applicationData, paymentPlan, month);
                } else {
                    showToast('Application data not found', 'error');
                    // Re-enable button if error
                    e.target.disabled = false;
                    e.target.textContent = 'Pay Now';
                }
            }, 'Error processing monthly payment');
        }
    });
}

// Cleanup function for page unload
function setupCleanup() {
    window.addEventListener('beforeunload', () => {
        // Clean up event listeners
        const events = [
            { element: elements.loginBtn, event: 'click', handler: signInWithGoogle },
            { element: elements.logoutBtn, event: 'click', handler: doLogout },
            { element: elements.startApplicationBtn, event: 'click', handler: () => {} },
            { element: elements.pledgeForm, event: 'submit', handler: submitApplication },
            { element: elements.reportCardUpload, event: 'click', handler: () => {} },
            { element: elements.reportCard, event: 'change', handler: () => {} },
            { element: elements.idDocumentUpload, event: 'click', handler: () => {} },
            { element: elements.idDocument, event: 'change', handler: () => {} },
            { element: elements.clearSignature, event: 'click', handler: () => {} },
            { element: elements.clearLearnerSignature, event: 'click', handler: () => {} },
            { element: elements.clearParentSignaturePledge, event: 'click', handler: () => {} },
            { element: elements.contactSupportBtn, event: 'click', handler: () => {} },
            { element: elements.gradeSelect, event: 'change', handler: () => {} }
        ];
        
        events.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        
        // Clean up file upload listeners
        [elements.reportCardUpload, elements.idDocumentUpload].forEach(uploadArea => {
            if (uploadArea) {
                uploadArea.removeEventListener('dragover', () => {});
                uploadArea.removeEventListener('dragleave', () => {});
                uploadArea.removeEventListener('drop', () => {});
                uploadArea.removeEventListener('keydown', () => {});
            }
        });
    });
}

// Initialize cleanup on load
setupCleanup();

// Make functions available globally for other modules
window.loadDashboardData = loadDashboardData;
window.setupApplicationListener = setupApplicationListener;
window.generateMonthlyPayments = generateMonthlyPayments;
window.checkAndHidePaymentPlan = checkAndHidePaymentPlan;

// Payment Plan Confirmation Modal Function
async function showPaymentPlanConfirmationModal(applicationData, paymentPlan) {
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
                            <p><strong>Are you sure you want to select the <span id="confirmPlanName">${paymentPlan}</span> payment plan?</strong></p>
                            <div class="plan-details" id="confirmPlanDetails">
                                <!-- Plan details will be populated here -->
                            </div>
                            <p>Once confirmed, you will see a list of monthly payments that you can pay individually.</p>
                            <div class="payment-security">
                                <i class="fas fa-lock"></i>
                                <span>You can change your payment plan later if needed</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="confirmPlanSelection" class="btn btn-primary">
                            <i class="fas fa-check"></i> Confirm Payment Plan
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

        const handleConfirm = async () => {
            modal.style.display = 'none';
            cleanupListeners();
            resolve(true);
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanupListeners();
            resolve(false);
        };

        const handleModalClick = (e) => {
            if (e.target === modal) handleCancel();
        };

        const cleanupListeners = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleModalClick);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleModalClick);

        modal.style.display = 'flex';
    });
}

// Helper functions for fee calculations (needed for the modal)
function calculateSubjectFees(subjectCount, paymentPlan) {
    const FEE_STRUCTURE = {
        subjects: {
            1: { upfront: 110000, sixMonths: 130000, tenMonths: 150000 },
            2: { upfront: 210000, sixMonths: 230000, tenMonths: 250000 },
            3: { upfront: 310000, sixMonths: 330000, tenMonths: 350000 },
            4: { upfront: 410000, sixMonths: 430000, tenMonths: 450000 }
        }
    };
    
    const count = Math.min(Math.max(subjectCount, 1), 4);
    const fees = FEE_STRUCTURE.subjects[count];
    return {
        amount: fees[paymentPlan],
        displayAmount: (fees[paymentPlan] / 100).toFixed(2),
        subjectCount: count,
        paymentPlan: paymentPlan
    };
}

function calculateMonthlyAmount(subjectCount, paymentPlan) {
    const total = calculateSubjectFees(subjectCount, paymentPlan);
    const months = paymentPlan === 'sixMonths' ? 6 : 10;
    return {
        monthlyAmount: Math.ceil(total.amount / months),
        monthlyDisplayAmount: (Math.ceil(total.amount / months) / 100).toFixed(2),
        totalAmount: total.amount,
        totalDisplayAmount: total.displayAmount
    };
}