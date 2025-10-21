import { elements, dateFormat } from './constants.js';
import { showToast, withErrorHandling, retryOperation } from './utilities.js';
import { uploadFile } from './storage.js';
import { calculateSubjectFees, generateMonthlyPayments } from './payments.js';
import { showSection } from './ui.js';

// Global variable to track the current application listener
window.currentApplicationListener = null;

// Database operations with enhanced error handling
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
            status: 'application_pending',
            paymentStatus: 'pending',
            applicationFee: 200.00, // R200 application fee
            subjectCount: formData.selectedSubjects?.length || 0,
            formData: { ...formData },
            createdAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
            updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
        };

        // Remove file objects and signatures from formData copy
        delete draftData.formData.reportCardFile;
        delete draftData.formData.idDocumentFile;
        delete draftData.formData.parentSignature;
        delete draftData.formData.learnerSignature;
        delete draftData.formData.parentSignaturePledge;

        await retryOperation(
            () => window.firebaseSetDoc(appRef, draftData, { merge: true }),
            3,
            1000
        );
        
        console.log('Application saved as draft pending payment');
        return true;
    }, 'Error saving application draft');
}

export async function completeApplicationSubmission(formData) {
    return await withErrorHandling(async () => {
        const user = window.firebaseAuth.currentUser;
        if (!user) throw new Error('User not authenticated');
        
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
        const spinner = elements.applicationSection?.querySelector('.loading-spinner');

        try {
            if (spinner) spinner.style.display = 'block';
            
            // Upload files with retry logic
            let reportCardUrl = '';
            let idDocumentUrl = '';
            
            if (formData.reportCardFile) {
                reportCardUrl = await retryOperation(
                    () => uploadFile(formData.reportCardFile, 'reportCard'),
                    3,
                    1000
                );
            }
            
            if (formData.idDocumentFile) {
                idDocumentUrl = await retryOperation(
                    () => uploadFile(formData.idDocumentFile, 'idDocument'),
                    3,
                    1000
                );
            }

            const applicationData = {
                ...formData,
                reportCardUrl,
                idDocumentUrl,
                status: 'submitted',
                submittedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
                paymentStatus: 'application_paid' // Application fee paid, subject fees pending
            };

            // Remove file objects before saving to Firestore
            delete applicationData.reportCardFile;
            delete applicationData.idDocumentFile;

            await retryOperation(
                () => window.firebaseSetDoc(appRef, applicationData),
                3,
                1000
            );
            
            // Show dashboard instead of simple status
            showDashboardSection();
            
            showToast('Application submitted successfully!', 'success');
            return true;
            
        } finally {
            if (spinner) spinner.style.display = 'none';
        }
    }, 'Error completing application submission');
}

export async function updateApplicationPaymentStatus(applicationId, status) {
    return await withErrorHandling(async () => {
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
        
        await retryOperation(
            () => window.firebaseSetDoc(appRef, {
                paymentStatus: status,
                updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            }, { merge: true }),
            3,
            1000
        );
        
        console.log(`Payment status updated to: ${status}`);
        return true;
    }, 'Error updating payment status');
}

// Add real-time listener for application updates
export function setupApplicationListener(userId, callback) {
    return withErrorHandling(() => {
        if (!window.firebaseOnSnapshot) {
            throw new Error('Firebase onSnapshot function not available');
        }
        
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', userId);
        
        // Set up real-time listener
        const unsubscribe = window.firebaseOnSnapshot(appRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log('Real-time update received:', data);
                callback(data);
            }
        }, (error) => {
            console.error('Real-time listener error:', error);
            showToast('Error receiving updates. Please refresh the page.', 'error');
        });
        
        return unsubscribe;
    }, 'Error setting up application listener');
}

// Clean up existing listener
function cleanupApplicationListener() {
    if (window.currentApplicationListener && typeof window.currentApplicationListener === 'function') {
        window.currentApplicationListener();
        window.currentApplicationListener = null;
        console.log('Previous application listener cleaned up');
    }
}

// Enhanced dashboard data loading with real-time updates
export async function loadDashboardData(userId, enableRealtime = true) {
    return await withErrorHandling(async () => {
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', userId);
        const docSnap = await retryOperation(
            () => window.firebaseGetDoc(appRef),
            3,
            1000
        );
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            updateDashboardUI(data);
            
            // Set up real-time listener if enabled
            if (enableRealtime && window.firebaseOnSnapshot) {
                // Clean up any existing listener first
                cleanupApplicationListener();
                
                const unsubscribe = setupApplicationListener(userId, (updatedData) => {
                    console.log('Application data updated:', updatedData);
                    updateDashboardUI(updatedData);
                    
                    // Show notification for status changes
                    if (updatedData.status !== data.status) {
                        const statusText = getStatusText(updatedData.status);
                        showToast(`Application status updated: ${statusText}`, 'info');
                    }
                });
                
                // Store unsubscribe function for cleanup
                window.currentApplicationListener = unsubscribe;
            }
            
            return data;
        }
        return null;
    }, 'Error loading dashboard data');
}

// Helper function for status text
function getStatusText(status) {
    const statusMap = {
        'submitted': 'Submitted',
        'under-review': 'Under Review',
        'approved': 'Approved',
        'rejected': 'Rejected'
    };
    return statusMap[status] || status;
}

export async function checkApplicationStatus(user) {
    return await withErrorHandling(async () => {
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', user.uid);
        const docSnap = await retryOperation(
            () => window.firebaseGetDoc(appRef),
            3,
            1000
        );
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            elements.startApplicationBtn.style.display = 'none';
            
            if (data.paymentStatus === 'application_paid' || data.paymentStatus === 'fully_paid') {
                showDashboardSection();
                // Enable real-time updates
                await loadDashboardData(user.uid, true);
                
                // Also update the simple status section for backward compatibility
                if (elements.currentAppStatus) elements.currentAppStatus.textContent = data.status || 'submitted';
                if (elements.submittedDate && data.submittedAt?.toDate) {
                    elements.submittedDate.textContent = data.submittedAt.toDate().toLocaleDateString('en-US', dateFormat);
                }
            } else {
                showSection('application');
                elements.startApplicationBtn.style.display = 'inline-flex';
            }
            
            return data;
        } else {
            elements.startApplicationBtn.style.display = 'inline-flex';
            showSection('application');
            return null;
        }
    }, 'Error checking application status');
}

// Enhanced payment return handler
export async function handlePaymentReturn() {
    return await withErrorHandling(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment_status');
        const applicationId = urlParams.get('application_id');
        const reference = urlParams.get('reference');
        
        if (paymentStatus && applicationId) {
            try {
                if (paymentStatus === 'success' || paymentStatus === 'COMPLETE') {
                    // Update application status to paid
                    await updateApplicationPaymentStatus(applicationId, 'application_paid');
                    
                    showToast('Payment successful! Your application has been submitted.', 'success');
                    
                    // Clean URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    // Redirect to dashboard
                    setTimeout(() => {
                        if (window.loadDashboardData) {
                            window.loadDashboardData(applicationId);
                        }
                    }, 2000);
                    
                } else if (paymentStatus === 'CANCELLED') {
                    showToast('Payment was cancelled. You can complete payment later.', 'info');
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (error) {
                console.error('Error processing payment return:', error);
                showToast('Payment completed but there was an error updating your application. Please contact support.', 'warning');
            }
        }
        
        return { paymentStatus, applicationId, reference };
    }, 'Error handling payment return');
}

// Enhanced UI update with better error handling
function updateDashboardUI(data) {
    try {
        // Update status tab
        if (data.submittedAt) {
            const applicationDate = document.getElementById('applicationDate');
            if (applicationDate) {
                applicationDate.textContent = data.submittedAt.toDate ? 
                    data.submittedAt.toDate().toLocaleDateString() : 'Recently';
            }
        }
        
        // Update subjects summary
        const subjectCount = data.selectedSubjects?.length || 0;
        const subjectsSummary = document.getElementById('subjectsSummary');
        if (subjectsSummary) {
            subjectsSummary.textContent = `${subjectCount} ${subjectCount === 1 ? 'subject' : 'subjects'}`;
        }
        
        // Update payment status with enhanced visual feedback
        updatePaymentStatusUI(data);
        
        // Update payment plan
        if (data.paymentPlan) {
            const paymentPlanSummary = document.getElementById('paymentPlanSummary');
            if (paymentPlanSummary) {
                const planDisplay = {
                    'upfront': 'Upfront Payment',
                    'sixMonths': '6 Months Installment',
                    'tenMonths': '10 Months Installment'
                };
                paymentPlanSummary.textContent = planDisplay[data.paymentPlan] || data.paymentPlan;
            }
            
            // If payment plan is selected, show monthly payments and hide payment cards
            updatePaymentDisplay(data);
        }
        
        // Update payments tab
        updatePaymentOptions(data);
        
    } catch (error) {
        console.error('Error updating dashboard UI:', error);
        showToast('Error updating dashboard display', 'error');
    }
}

// Enhanced payment status update
function updatePaymentStatusUI(data) {
    const tuitionFeeStatus = document.getElementById('tuitionFeeStatus');
    const tuitionFeeBadge = document.getElementById('tuitionFeeBadge');
    const overallStatusBadge = document.getElementById('overallStatusBadge');
    
    // Update tuition fee status
    if (data.paymentStatus === 'fully_paid') {
        if (tuitionFeeStatus) {
            tuitionFeeStatus.textContent = 'Paid';
            tuitionFeeStatus.className = 'status-paid';
        }
        if (tuitionFeeBadge) {
            tuitionFeeBadge.textContent = 'Paid';
            tuitionFeeBadge.className = 'fee-status paid';
        }
    } else {
        if (tuitionFeeStatus) {
            tuitionFeeStatus.textContent = 'Pending';
            tuitionFeeStatus.className = 'status-pending';
        }
        if (tuitionFeeBadge) {
            tuitionFeeBadge.textContent = 'Pending';
            tuitionFeeBadge.className = 'fee-status pending';
        }
    }
    
    // Update overall status badge
    if (overallStatusBadge) {
        if (data.paymentStatus === 'application_paid') {
            overallStatusBadge.textContent = 'Under Review';
            overallStatusBadge.className = 'status-badge approved';
        } else if (data.paymentStatus === 'fully_paid') {
            overallStatusBadge.textContent = 'Complete';
            overallStatusBadge.className = 'status-badge completed';
        } else {
            overallStatusBadge.textContent = 'Pending Payment';
            overallStatusBadge.className = 'status-badge pending';
        }
    }
}

// Enhanced payment display management
function updatePaymentDisplay(data) {
    const paymentCards = document.querySelector('.payment-cards');
    const monthlyPayments = document.getElementById('monthlyPayments');
    const paymentPlan = data.paymentPlan;
    
    if (paymentCards && monthlyPayments) {
        if (paymentPlan === 'upfront') {
            // Hide all payment cards and monthly payments for upfront (already paid)
            paymentCards.style.display = 'none';
            monthlyPayments.style.display = 'none';
            
            // Also hide the payment options section entirely
            const paymentOptions = document.querySelector('.payment-options');
            if (paymentOptions) {
                paymentOptions.style.display = 'none';
            }
        } else if (paymentPlan === 'sixMonths' || paymentPlan === 'tenMonths') {
            // Hide payment cards and show monthly payments for installment plans
            paymentCards.style.display = 'none';
            monthlyPayments.style.display = 'block';
            
            // Generate monthly payment buttons
            if (window.generateMonthlyPayments) {
                window.generateMonthlyPayments(data, paymentPlan);
            }
        } else {
            // Show payment cards if no plan selected
            paymentCards.style.display = 'grid';
            monthlyPayments.style.display = 'none';
        }
    }
}

// Enhanced payment options update
function updatePaymentOptions(data) {
    const subjectCount = data.selectedSubjects?.length || 0;
    
    if (subjectCount > 0 && !data.paymentPlan) {
        try {
            const upfrontFee = calculateSubjectFees(subjectCount, 'upfront');
            const sixMonthsFee = calculateSubjectFees(subjectCount, 'sixMonths');
            const tenMonthsFee = calculateSubjectFees(subjectCount, 'tenMonths');
            
            // Update upfront card
            const upfrontAmount = document.getElementById('upfrontAmount');
            const tuitionAmount = document.getElementById('tuitionAmount');
            if (upfrontAmount) upfrontAmount.textContent = `R${upfrontFee.displayAmount}`;
            if (tuitionAmount) tuitionAmount.textContent = `R${upfrontFee.displayAmount}`;
            
            // Update 6 months card
            const sixMonthsMonthly = document.getElementById('sixMonthsMonthly');
            const sixMonthsTotal = document.getElementById('sixMonthsTotal');
            if (sixMonthsMonthly) {
                const monthlyAmount = (sixMonthsFee.amount / 6 / 100).toFixed(2);
                sixMonthsMonthly.textContent = `R${monthlyAmount}/month`;
            }
            if (sixMonthsTotal) {
                sixMonthsTotal.textContent = `R${sixMonthsFee.displayAmount}`;
            }
            
            // Update 10 months card
            const tenMonthsMonthly = document.getElementById('tenMonthsMonthly');
            const tenMonthsTotal = document.getElementById('tenMonthsTotal');
            if (tenMonthsMonthly) {
                const monthlyAmount = (tenMonthsFee.amount / 10 / 100).toFixed(2);
                tenMonthsMonthly.textContent = `R${monthlyAmount}/month`;
            }
            if (tenMonthsTotal) {
                tenMonthsTotal.textContent = `R${tenMonthsFee.displayAmount}`;
            }
        } catch (error) {
            console.error('Error updating payment options:', error);
        }
    }
}

// Enhanced dashboard section display
function showDashboardSection() {
    try {
        const dashboardSection = document.getElementById('dashboardSection');
        const applicationSection = document.getElementById('applicationSection');
        const applicationStatus = document.getElementById('applicationStatus');
        
        if (dashboardSection) {
            dashboardSection.style.display = 'block';
            if (applicationSection) applicationSection.style.display = 'none';
            if (applicationStatus) applicationStatus.style.display = 'none';
        } else {
            // Fallback to original status section
            showSection('status');
        }
    } catch (error) {
        console.error('Error showing dashboard section:', error);
        showSection('status');
    }
}

// Make functions available globally for other modules
window.loadDashboardData = loadDashboardData;
window.setupApplicationListener = setupApplicationListener;
window.cleanupApplicationListener = cleanupApplicationListener;