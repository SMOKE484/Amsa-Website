// database.js

import { elements, dateFormat } from './constants.js';
import { showToast, withErrorHandling, retryOperation } from './utilities.js';
import { uploadFile } from './storage.js';
// Import necessary payment functions, including checkAndHidePaymentPlan
import { calculateSubjectFees, generateMonthlyPayments, checkAndHidePaymentPlan } from './payments.js';
// Import UI functions, assuming updateDashboardUI is now in ui.js
import { showSection, updateDashboardUI } from './ui.js';
// Import the permission request function from main.js
import { requestNotificationPermissionAndSaveToken } from './main.js';

// Global variable to track the current application listener
window.currentApplicationListener = null;

// --- Database Operations ---

/**
 * Saves the initial application data as a draft before application fee payment.
 * @param {object} formData - The collected form data.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function saveApplicationAsDraft(formData) {
    return await withErrorHandling(async () => {
        const user = window.firebaseAuth.currentUser;
        if (!user) throw new Error('User not authenticated');

        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);

        const draftData = {
            userId: user.uid,
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            grade: formData.grade,
            school: formData.school,
            subjects: formData.selectedSubjects,
            status: 'application_pending', // Status before submission/payment
            paymentStatus: 'pending',
            applicationFee: 200.00, // R200 application fee
            subjectCount: formData.selectedSubjects?.length || 0,
            formData: { ...formData }, // Store a copy of form data excluding sensitive parts
            createdAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
            updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
        };

        // Remove file objects and signatures from the stored formData copy for security/size
        delete draftData.formData.reportCardFile;
        delete draftData.formData.idDocumentFile;
        delete draftData.formData.parentSignature;
        delete draftData.formData.learnerSignature;
        delete draftData.formData.parentSignaturePledge;

        // Save draft data with merge option to avoid overwriting existing fields if retrying
        await retryOperation(
            () => window.firebaseSetDoc(appRef, draftData, { merge: true }),
            3, // Max retries
            1000 // Delay between retries (ms)
        );

        console.log('Application saved as draft pending payment');
        return true;
    }, 'Error saving application draft');
}

/**
 * Completes the application submission after successful application fee payment.
 * Uploads files and updates the application status.
 * @param {object} formData - The full application form data including file objects.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function completeApplicationSubmission(formData) {
    // 1. Define UI Elements to Reset
    const submitBtn = document.querySelector('#pledgeForm .submit-btn');
    const spinner = document.querySelector('.loading-spinner');
    const paymentModal = document.getElementById('paystackPaymentModal');
    const loadingOverlay = document.getElementById('paymentLoading');

    // Helper to Reset UI
    const resetUI = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
        }
        if (spinner) spinner.style.display = 'none';
        if (paymentModal) paymentModal.style.display = 'none';
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    };

    return await withErrorHandling(async () => {
        const user = window.firebaseAuth.currentUser;
        if (!user) throw new Error('User not authenticated');

        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
        
        // Visual Feedback: Show spinner
        if (spinner) spinner.style.display = 'flex';

        try {
            // --- Upload Files ---
            let reportCardUrl = '';
            let idDocumentUrl = '';

            // Check if file exists and is valid
            if (formData.reportCardFile && formData.reportCardFile instanceof File) {
                console.log('Uploading report card...');
                reportCardUrl = await retryOperation(
                    () => uploadFile(formData.reportCardFile, 'reportCard'),
                    3, 1000
                );
                console.log('Report card uploaded:', reportCardUrl);
            }

            if (formData.idDocumentFile && formData.idDocumentFile instanceof File) {
                console.log('Uploading ID document...');
                idDocumentUrl = await retryOperation(
                    () => uploadFile(formData.idDocumentFile, 'idDocument'),
                    3, 1000
                );
                 console.log('ID document uploaded:', idDocumentUrl);
            }

            // --- Save Data ---
            const applicationData = {
                ...formData, 
                reportCardUrl: reportCardUrl || '', 
                idDocumentUrl: idDocumentUrl || '', 
                status: 'submitted', 
                submittedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
                paymentStatus: 'application_paid', 
                updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            };

            // Cleanup
            delete applicationData.reportCardFile;
            delete applicationData.idDocumentFile;

            console.log('Saving to Firestore:', applicationData);

            await retryOperation(
                () => window.firebaseSetDoc(appRef, applicationData), 
                3, 1000
            );

            console.log('Submission Successful');

            // --- CRITICAL: Reset UI & Redirect ---
            resetUI(); 
            
            // Redirect to Dashboard
            if (typeof showSection === 'function') {
                showSection('dashboard'); 
            } else {
                 // Fallback if import missing
                 document.getElementById('pledgeSection').style.display = 'none';
                 document.getElementById('dashboardSection').style.display = 'block';
            }
            
            showToast('Application submitted successfully!', 'success');
            return true;

        } catch (error) {
            // IF ERROR: Reset UI so user can try again!
            resetUI();
            console.error("Submission failed:", error);
            throw error; // Let withErrorHandling show the toast
        }
    }, 'Error completing application submission');
}

/**
 * Updates only the payment status field of an application document.
 * @param {string} applicationId - The user ID (document ID).
 * @param {string} status - The new payment status (e.g., 'application_paid', 'fully_paid').
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function updateApplicationPaymentStatus(applicationId, status) {
    return await withErrorHandling(async () => {
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);

        await retryOperation(
            () => window.firebaseSetDoc(appRef, { // Use setDoc with merge: true or updateDoc
                paymentStatus: status,
                updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            }, { merge: true }),
            3, 1000
        );

        console.log(`Payment status updated to: ${status} for application ${applicationId}`);
        return true;
    }, 'Error updating payment status');
}

// --- Real-time Listener Setup ---

/**
 * Sets up a real-time Firestore listener for a specific application document.
 * @param {string} userId - The user ID (document ID) to listen to.
 * @param {function} callback - Function to call with the updated data when changes occur.
 * @returns {function | null} - The unsubscribe function, or null if setup failed.
 */
export function setupApplicationListener(userId, callback) {
    // Note: withErrorHandling might interfere with returning the unsubscribe function.
    // Handle errors directly within this function for listener setup.
    try {
        if (!window.firebaseOnSnapshot) {
            throw new Error('Firebase onSnapshot function not available');
        }
        if (!userId) {
            throw new Error('User ID is required to set up listener');
        }
        if (typeof callback !== 'function') {
            throw new Error('Callback function is required');
        }

        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', userId);
        console.log(`Setting up real-time listener for application: ${userId}`);

        // Set up the real-time listener
        const unsubscribe = window.firebaseOnSnapshot(appRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log(`Real-time update received for ${userId}:`, data);
                callback(data); // Pass the updated data to the callback function
            } else {
                // Document might have been deleted, or listener attached before creation
                console.warn(`Listener active, but document ${userId} does not exist.`);
                // You might want to call the callback with null or handle this case specifically
                // callback(null);
            }
        }, (error) => {
            // Handle listener errors (e.g., permissions)
            console.error(`Real-time listener error for ${userId}:`, error);
            showToast('Error receiving application updates. Please refresh.', 'error');
            // Consider cleaning up the listener here if the error is permanent
            cleanupApplicationListener();
        });

        return unsubscribe; // Return the function to stop listening

    } catch (error) {
        console.error('Error setting up application listener:', error);
        showToast('Failed to set up real-time updates.', 'error');
        return null; // Return null on setup failure
    }
}

/**
 * Cleans up (unsubscribes) the currently active application listener, if any.
 */
function cleanupApplicationListener() {
    if (window.currentApplicationListener && typeof window.currentApplicationListener === 'function') {
        try {
            window.currentApplicationListener(); // Call the unsubscribe function
            window.currentApplicationListener = null;
            console.log('Previous application listener cleaned up successfully.');
        } catch (error) {
            console.error('Error cleaning up application listener:', error);
        }
    } else {
         // console.log('No active application listener to clean up.');
    }
}

// --- Dashboard and Status Check ---

/**
 * Loads the application data for the dashboard, updates the UI,
 * requests notification permission, and sets up a real-time listener.
 * @param {string} userId - The user ID (document ID).
 * @param {boolean} [enableRealtime=true] - Whether to attach a real-time listener.
 * @returns {Promise<object|null>} - The application data or null if not found/error.
 */
export async function loadDashboardData(userId, enableRealtime = true) {
    return await withErrorHandling(async () => {
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', userId);
        console.log(`Loading dashboard data for ${userId}...`);
        const docSnap = await retryOperation(
            () => window.firebaseGetDoc(appRef),
            3, 1000
        );

        if (docSnap.exists()) {
            const data = docSnap.data();
            data.id = userId; // Ensure the document ID is part of the data object

            console.log('Dashboard data fetched:', data);

            // 1. Update the dashboard UI with the fetched data
            updateDashboardUI(data);

            // 2. Request notification permission (will check status internally)
            console.log('Attempting to request notification permission...');
            // Ensure the function exists before calling
            if (typeof requestNotificationPermissionAndSaveToken === 'function') {
                await requestNotificationPermissionAndSaveToken();
            } else {
                console.error('requestNotificationPermissionAndSaveToken function not found/imported correctly.');
            }

            // 3. Check and potentially hide payment plan selector based on current data
            // Ensure the function exists before calling
            if (typeof checkAndHidePaymentPlan === 'function') {
                 checkAndHidePaymentPlan(data);
            } else {
                 console.error('checkAndHidePaymentPlan function not found/imported correctly.');
            }


            // 4. Set up real-time listener if enabled
            if (enableRealtime && window.firebaseOnSnapshot) {
                cleanupApplicationListener(); // Ensure only one listener is active

                const unsubscribe = setupApplicationListener(userId, (updatedData) => {
                    console.log('Real-time update received for dashboard:', updatedData);
                    // Merge new data with existing, ensuring ID stays
                    const mergedData = { ...data, ...updatedData, id: userId };

                    // Re-update UI with the latest merged data
                    updateDashboardUI(mergedData);
                    // Re-check payment plan visibility
                     if (typeof checkAndHidePaymentPlan === 'function') {
                         checkAndHidePaymentPlan(mergedData);
                     }

                    // Optional: Show a toast notification only for status changes
                    if (updatedData.status && data.status && updatedData.status !== data.status) {
                        const statusText = getStatusText(updatedData.status);
                        showToast(`Application status updated: ${statusText}`, 'info');
                    }
                });

                // Store the unsubscribe function globally for potential cleanup later
                window.currentApplicationListener = unsubscribe;
            }

            return data; // Return the initially loaded data

        } else {
            // No application document found for this user
            console.warn(`No application data found for user ${userId} in loadDashboardData.`);
            showToast('Application data not found. Please start a new application.', 'info');
            // Transition UI back to the start
            showSection('application');
            if (elements.startApplicationBtn) {
                 elements.startApplicationBtn.style.display = 'inline-flex';
            }
            if (elements.dashboardSection) {
                 elements.dashboardSection.style.display = 'none';
            }
            return null;
        }
    }, 'Error loading dashboard data');
}

/**
 * Checks if an application exists for the current user and loads the dashboard or shows the form.
 * @param {object} user - The authenticated Firebase user object.
 * @returns {Promise<object|null>} - The application data or null if none exists/error.
 */
export async function checkApplicationStatus(user) {
    return await withErrorHandling(async () => {
        if (!user || !user.uid) {
            throw new Error('User object is invalid.');
        }
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
        console.log(`Checking application status for user ${user.uid}...`);
        const docSnap = await retryOperation(
            () => window.firebaseGetDoc(appRef),
            3, 1000
        );

        if (docSnap.exists()) {
            // Application exists, proceed to load the dashboard
            console.log(`Application found for user ${user.uid}. Loading dashboard...`);
            if (elements.startApplicationBtn) elements.startApplicationBtn.style.display = 'none';
            showDashboardSection(); // Make dashboard visible

            // Load data, update UI, request permission, set up listener
            const loadedData = await loadDashboardData(user.uid, true);

            // Also update the simpler status section elements if they exist
            // (might be redundant if dashboard loads correctly)
            const data = docSnap.data(); // Use initially fetched data for this part
            if (elements.currentAppStatus) elements.currentAppStatus.textContent = data.status || 'submitted';
            if (elements.submittedDate && data.submittedAt?.toDate) {
                elements.submittedDate.textContent = data.submittedAt.toDate().toLocaleDateString('en-US', dateFormat);
            }

            return loadedData; // Return the data loaded by loadDashboardData

        } else {
            // No application exists for this user
            console.log(`No application found for user ${user.uid}. Showing application form.`);
            if (elements.startApplicationBtn) elements.startApplicationBtn.style.display = 'inline-flex';
            if (elements.dashboardSection) elements.dashboardSection.style.display = 'none'; // Ensure dashboard is hidden
            showSection('application'); // Show the application form section
            return null;
        }
    }, 'Error checking application status');
}

// --- Payment Handling ---

/**
 * Handles the return from the Paystack payment gateway.
 * Updates application status based on payment success/failure.
 * @returns {Promise<object|null>} - Object with payment details or null on error.
 */
export async function handlePaymentReturn() {
    return await withErrorHandling(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment_status'); // Check common query params
        const transactionStatus = urlParams.get('status'); // Paystack might use 'status'
        const reference = urlParams.get('reference') || urlParams.get('trxref'); // Paystack uses trxref sometimes

        // Determine success based on possible parameters
        const isSuccess = paymentStatus === 'success' || paymentStatus === 'COMPLETE' || transactionStatus === 'success';
        const isCancelled = paymentStatus === 'CANCELLED' || transactionStatus === 'cancelled';

        // Extract application ID from metadata if possible, or ref if structured
        let applicationId = urlParams.get('application_id'); // Try direct param first
        if (!applicationId && reference && reference.includes('_')) {
             // Attempt to parse from reference if it follows a pattern like TYPE_ID_TIMESTAMP
             const parts = reference.split('_');
             if (parts.length >= 2 && (parts[0] === 'APPLICATION' || parts[0] === 'TUITION')) {
                 applicationId = parts[1]; // Assume second part is the ID
             }
        }

        console.log('Handling payment return:', { paymentStatus, transactionStatus, reference, applicationId, isSuccess, isCancelled });

        if (applicationId && (isSuccess || isCancelled)) {
            // Clean the URL parameters immediately
            window.history.replaceState({}, document.title, window.location.pathname);

            if (isSuccess) {
                try {
                    // Update application status to 'application_paid' (assuming this is application fee)
                    // More complex logic might be needed if handling tuition fees here too
                    await updateApplicationPaymentStatus(applicationId, 'application_paid');
                    showToast('Payment successful! Your application is being submitted.', 'success');

                    // Allow time for Firestore update to propagate before loading dashboard
                    setTimeout(() => {
                        const user = window.firebaseAuth.currentUser;
                        if (user && user.uid === applicationId) {
                            showDashboardSection(); // Show dashboard
                            loadDashboardData(applicationId, true); // Load data for the dashboard
                        } else {
                             console.warn('User mismatch or not logged in after payment return.');
                             // Maybe redirect to login or show a generic success message
                             showSection('status'); // Show generic status page
                        }
                    }, 1500); // Delay slightly

                } catch (error) {
                    console.error('Error processing successful payment return:', error);
                    showToast('Payment confirmed, but error updating application. Contact support.', 'warning');
                     // Still try to load dashboard or show status
                     setTimeout(() => showSection('status'), 1500);
                }
            } else if (isCancelled) {
                showToast('Payment was cancelled. You can complete payment later.', 'info');
                // Potentially redirect back to the application form or show a specific message
                 setTimeout(() => showSection('application'), 1500);
            }
        } else if (reference) {
             // Clean URL even if we couldn't process fully
             window.history.replaceState({}, document.title, window.location.pathname);
             console.log('Payment return detected, but could not extract necessary info or status was inconclusive.');
        }

        return { paymentStatus, transactionStatus, reference, applicationId }; // Return extracted info
    }, 'Error handling payment return');
}


// --- Helper Functions ---

/**
 * Gets a display-friendly text for a status code.
 * @param {string} status - The status code (e.g., 'submitted', 'under-review').
 * @returns {string} - The display text.
 */
function getStatusText(status) {
    const statusMap = {
        'application_pending': 'Draft (Payment Pending)',
        'submitted': 'Submitted',
        'under-review': 'Under Review',
        'approved': 'Approved',
        'rejected': 'Rejected',
        // Add more statuses as needed
    };
    return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // Default formatting
}

/**
 * Shows the main dashboard section and hides others.
 */
function showDashboardSection() {
    try {
        const dashboard = document.getElementById('dashboardSection');
        const application = document.getElementById('applicationSection');
        const status = document.getElementById('applicationStatus'); // Simple status page
        const existing = document.getElementById('existingApplication');

        if (dashboard) dashboard.style.display = 'block';
        if (application) application.style.display = 'none';
        if (status) status.style.display = 'none';
        if (existing) existing.style.display = 'none';

        console.log('UI switched to Dashboard Section.');

    } catch (error) {
        console.error('Error showing dashboard section:', error);
        // Fallback gracefully
        showSection('status'); // Show the simple status page as a fallback
    }
}


// Make key functions globally available if needed by older parts of the code or HTML event handlers
window.loadDashboardData = loadDashboardData;
window.setupApplicationListener = setupApplicationListener;
window.cleanupApplicationListener = cleanupApplicationListener;