import { elements } from './constants.js';
import { showToast } from './utilities.js';
import { showPaystackPaymentModal, initiateTuitionPayment, generateMonthlyPayments, canPayTuition, initializePaymentPlanSelection } from './payments.js';
import { showSection } from './ui.js';

// Fee structure (same as in payments.js)
const FEE_STRUCTURE = {
    subjects: {
        1: {
            upfront: 110000,
            sixMonths: 130000,
            tenMonths: 150000
        },
        2: {
            upfront: 210000,
            sixMonths: 230000,
            tenMonths: 250000
        },
        3: {
            upfront: 310000,
            sixMonths: 330000,
            tenMonths: 350000
        },
        4: {
            upfront: 410000,
            sixMonths: 430000,
            tenMonths: 450000
        }
    }
};

let currentApplicationData = null;
let applicationListenerUnsubscribe = null;

export function showDashboard(applicationData) {
    console.log('Showing dashboard with data:', applicationData);
    currentApplicationData = applicationData;
    updateDashboardDisplay(applicationData);
    showSection('dashboard');
    initializeDashboardTabs();
    initializePaymentButtons();
    initializePaymentPlanSelection(applicationData);
    
    // Enable real-time updates for the dashboard
    if (window.setupApplicationListener && applicationData.id) {
        // Clean up any existing listener first
        if (applicationListenerUnsubscribe) {
            applicationListenerUnsubscribe();
        }
        
        applicationListenerUnsubscribe = window.setupApplicationListener(applicationData.id, (updatedData) => {
            console.log('Dashboard received real-time update:', updatedData);
            currentApplicationData = { ...currentApplicationData, ...updatedData };
            updateDashboardDisplay(currentApplicationData);
            
            // Show notification for status changes
            if (updatedData.status && updatedData.status !== applicationData.status) {
                const statusText = getStatusText(updatedData.status);
                showToast(`Your application status has been updated to: ${statusText}`, 'info');
            }
        });
    }
}

// Clean up listener when leaving dashboard
export function cleanupDashboard() {
    if (applicationListenerUnsubscribe) {
        applicationListenerUnsubscribe();
        applicationListenerUnsubscribe = null;
    }
}

function updateDashboardDisplay(applicationData) {
    console.log('Updating dashboard display with:', applicationData);
    
    // Update basic information
    updateBasicInfo(applicationData);
    
    // Update application status with real-time updates
    updateApplicationStatusDisplay(applicationData);
    
    // Update payment amounts
    updatePaymentAmounts(applicationData);
    
    // Update status badges based on payment status
    updateStatusBadges(applicationData);
    
    // Update payment display based on application status and payment plan
    updatePaymentDisplay(applicationData);
    
    // Update summary section
    updateSummarySection(applicationData);
}

function updateBasicInfo(applicationData) {
    // Update status tab
    const appIdElement = document.getElementById('dashboardAppId');
    const studentNameElement = document.getElementById('dashboardStudentName');
    const gradeElement = document.getElementById('dashboardGrade');
    const subjectsElement = document.getElementById('dashboardSubjects');
    
    if (appIdElement) appIdElement.textContent = applicationData.id || 'N/A';
    if (studentNameElement) studentNameElement.textContent = `${applicationData.firstName || ''} ${applicationData.lastName || ''}`.trim() || 'N/A';
    if (gradeElement) gradeElement.textContent = applicationData.grade ? `Grade ${applicationData.grade}` : 'N/A';
    if (subjectsElement) subjectsElement.textContent = applicationData.selectedSubjects?.join(', ') || 'No subjects selected';
}

function updateApplicationStatusDisplay(applicationData) {
    const statusElement = document.getElementById('applicationStatusBadge');
    const statusTextElement = document.getElementById('applicationStatusText');
    
    console.log('Updating status display:', applicationData.status);
    
    if (statusElement && statusTextElement) {
        const status = applicationData.status || 'submitted';
        const statusText = getStatusText(status);
        const statusDescription = getStatusDescription(status);
        
        statusElement.textContent = statusText;
        statusElement.className = `status-badge status-${status}`;
        statusTextElement.textContent = statusDescription;
        
        // Update timeline based on status
        updateTimeline(applicationData);
    }
}

function updateTimeline(applicationData) {
    const timelineReview = document.getElementById('timelineReview');
    const timelineApproval = document.getElementById('timelineApproval');
    const timelineEnrollment = document.getElementById('timelineEnrollment');
    
    const status = applicationData.status || 'submitted';
    
    console.log('Updating timeline for status:', status);
    
    // Reset all timeline items
    [timelineReview, timelineApproval, timelineEnrollment].forEach(element => {
        if (element) {
            element.classList.remove('completed', 'current');
        }
    });
    
    // Update based on current status
    switch (status) {
        case 'submitted':
            if (timelineReview) timelineReview.classList.add('current');
            break;
        case 'under-review':
            if (timelineReview) timelineReview.classList.add('completed');
            if (timelineApproval) timelineApproval.classList.add('current');
            break;
        case 'approved':
            if (timelineReview) timelineReview.classList.add('completed');
            if (timelineApproval) timelineApproval.classList.add('completed');
            if (timelineEnrollment) timelineEnrollment.classList.add('current');
            
            // Update approval date if available
            if (applicationData.statusUpdates) {
                const approvalUpdate = applicationData.statusUpdates.find(update => update.status === 'approved');
                if (approvalUpdate && approvalUpdate.timestamp) {
                    const approvalDateElement = document.getElementById('approvalDate');
                    if (approvalDateElement) {
                        approvalDateElement.textContent = formatDate(approvalUpdate.timestamp);
                    }
                }
            }
            break;
        case 'rejected':
            // Handle rejected state - show appropriate message
            if (timelineReview) timelineReview.classList.add('completed');
            if (timelineApproval) timelineApproval.classList.add('completed');
            break;
    }
    
    // Update dates if available in status updates
    if (applicationData.statusUpdates) {
        applicationData.statusUpdates.forEach(update => {
            const dateElement = document.getElementById(`${update.status}Date`);
            if (dateElement && update.timestamp) {
                dateElement.textContent = formatDate(update.timestamp);
            }
        });
    }
    
    // Update application submission date
    if (applicationData.submittedAt) {
        const applicationDate = document.getElementById('applicationDate');
        if (applicationDate) {
            applicationDate.textContent = formatDate(applicationData.submittedAt);
        }
    }
}

function formatDate(date) {
    if (!date) return '-';
    try {
        const dateObj = date.toDate ? date.toDate() : new Date(date);
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        console.warn('Invalid date format:', date);
        return '-';
    }
}

function getStatusText(status) {
    const statusMap = {
        'submitted': 'Submitted',
        'under-review': 'Under Review',
        'approved': 'Approved',
        'rejected': 'Rejected'
    };
    return statusMap[status] || status;
}

function getStatusDescription(status) {
    const descriptionMap = {
        'submitted': 'Your application has been submitted and is awaiting review.',
        'under-review': 'Your application is currently being reviewed by our team.',
        'approved': 'Your application has been approved! You can now proceed with tuition payments.',
        'rejected': 'Your application has been rejected. Please contact support for more information.'
    };
    return descriptionMap[status] || 'Status update pending.';
}

function updatePaymentAmounts(applicationData) {
    const subjectCount = applicationData.selectedSubjects?.length || 0;
    const count = Math.min(Math.max(subjectCount, 1), 4);
    
    const upfrontAmount = FEE_STRUCTURE.subjects[count].upfront / 100;
    const sixMonthsAmount = FEE_STRUCTURE.subjects[count].sixMonths / 100;
    const tenMonthsAmount = FEE_STRUCTURE.subjects[count].tenMonths / 100;
    
    // Update display amounts
    const subjectFeeAmountDisplay = document.getElementById('subjectFeeAmountDisplay');
    const upfrontAmountElement = document.getElementById('upfrontAmount');
    const sixMonthsAmountElement = document.getElementById('sixMonthsAmount');
    const tenMonthsAmountElement = document.getElementById('tenMonthsAmount');
    
    if (subjectFeeAmountDisplay) subjectFeeAmountDisplay.textContent = `R${upfrontAmount.toFixed(2)}`;
    if (upfrontAmountElement) upfrontAmountElement.textContent = `R${upfrontAmount.toFixed(2)}`;
    if (sixMonthsAmountElement) sixMonthsAmountElement.textContent = `R${sixMonthsAmount.toFixed(2)}`;
    if (tenMonthsAmountElement) tenMonthsAmountElement.textContent = `R${tenMonthsAmount.toFixed(2)}`;
    
    // Calculate monthly amounts
    const sixMonthsMonthly = document.getElementById('sixMonthsMonthly');
    const tenMonthsMonthly = document.getElementById('tenMonthsMonthly');
    const sixMonthsTotal = document.getElementById('sixMonthsTotal');
    const tenMonthsTotal = document.getElementById('tenMonthsTotal');
    
    if (sixMonthsMonthly) sixMonthsMonthly.textContent = `R${(sixMonthsAmount / 6).toFixed(2)}`;
    if (tenMonthsMonthly) tenMonthsMonthly.textContent = `R${(tenMonthsAmount / 10).toFixed(2)}`;
    if (sixMonthsTotal) sixMonthsTotal.textContent = `R${sixMonthsAmount.toFixed(2)}`;
    if (tenMonthsTotal) tenMonthsTotal.textContent = `R${tenMonthsAmount.toFixed(2)}`;
}

function updateStatusBadges(applicationData) {
    const paymentStatus = applicationData.paymentStatus || 'pending';
    
    console.log('Updating status badges for payment status:', paymentStatus);
    
    // Update application fee status
    const appFeeBadge = document.getElementById('appFeeStatus');
    const appFeeStatusBadge = document.getElementById('appFeeStatusBadge');
    
    if (paymentStatus === 'application_paid' || paymentStatus === 'fully_paid') {
        if (appFeeBadge) {
            appFeeBadge.textContent = 'Paid';
            appFeeBadge.className = 'status-paid';
        }
        if (appFeeStatusBadge) {
            appFeeStatusBadge.textContent = 'Paid';
            appFeeStatusBadge.className = 'fee-status paid';
        }
    }
    
    // Update subject fee status
    const subjectFeeStatusBadge = document.getElementById('subjectFeeStatusBadge');
    
    if (paymentStatus === 'fully_paid') {
        if (subjectFeeStatusBadge) {
            subjectFeeStatusBadge.textContent = 'Paid';
            subjectFeeStatusBadge.className = 'fee-status paid';
        }
    } else {
        if (subjectFeeStatusBadge) {
            subjectFeeStatusBadge.textContent = 'Pending';
            subjectFeeStatusBadge.className = 'fee-status pending';
        }
    }
}

function updateSummarySection(applicationData) {
    const subjectCount = applicationData.selectedSubjects?.length || 0;
    const subjectsSummary = document.getElementById('subjectsSummary');
    if (subjectsSummary) {
        subjectsSummary.textContent = `${subjectCount} ${subjectCount === 1 ? 'subject' : 'subjects'}`;
    }
    
    const paymentPlanSummary = document.getElementById('paymentPlanSummary');
    if (paymentPlanSummary) {
        if (applicationData.paymentPlan) {
            const planDisplay = {
                'upfront': 'Upfront Payment',
                'sixMonths': '6 Months Installment',
                'tenMonths': '10 Months Installment'
            };
            paymentPlanSummary.textContent = planDisplay[applicationData.paymentPlan] || applicationData.paymentPlan;
        } else {
            paymentPlanSummary.textContent = 'Not selected';
        }
    }
    
    // Update tuition fee status
    const tuitionFeeStatus = document.getElementById('tuitionFeeStatus');
    if (tuitionFeeStatus) {
        if (applicationData.paymentStatus === 'fully_paid') {
            tuitionFeeStatus.textContent = 'Paid';
            tuitionFeeStatus.className = 'status-paid';
        } else {
            tuitionFeeStatus.textContent = 'Pending';
            tuitionFeeStatus.className = 'status-pending';
        }
    }
}

function updatePaymentDisplay(applicationData) {
    const paymentCards = document.querySelector('.payment-cards');
    const monthlyPayments = document.getElementById('monthlyPayments');
    const paymentOptions = document.querySelector('.payment-options');
    const tuitionPaymentNotice = document.getElementById('tuitionPaymentNotice');
    
    if (!paymentCards || !monthlyPayments || !paymentOptions) return;

    const paymentPlan = applicationData.paymentPlan;
    const isApproved = applicationData.status === 'approved';
    
    console.log('Updating payment display - Status:', applicationData.status, 'Payment Plan:', paymentPlan);
    
    // Show/hide tuition payment notice
    if (tuitionPaymentNotice) {
        if (isApproved) {
            tuitionPaymentNotice.style.display = 'block';
            tuitionPaymentNotice.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i>
                    <strong>Application Approved!</strong> You can now proceed with tuition fee payments.
                </div>
            `;
        } else {
            tuitionPaymentNotice.style.display = 'block';
            tuitionPaymentNotice.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <strong>Pending Approval:</strong> Tuition payments will be available once your application is approved.
                </div>
            `;
        }
    }
    
    if (paymentPlan === 'upfront' && applicationData.tuitionPaid) {
        // Hide all payment options for paid upfront
        paymentCards.style.display = 'none';
        monthlyPayments.style.display = 'none';
        paymentOptions.style.display = 'none';
        
    } else if (paymentPlan === 'sixMonths' || paymentPlan === 'tenMonths') {
        // Hide payment cards and show monthly payments for installment plans
        paymentCards.style.display = 'none';
        monthlyPayments.style.display = 'block';
        paymentOptions.style.display = 'block';
        
        // Generate monthly payment buttons
        generateMonthlyPayments(applicationData, paymentPlan);
        
    } else {
        // Show payment cards if no plan selected
        paymentCards.style.display = 'grid';
        monthlyPayments.style.display = 'none';
        paymentOptions.style.display = 'block';
    }
    
    // Disable payment buttons if application is not approved
    const paymentButtons = document.querySelectorAll('.pay-tuition-btn, .pay-month-btn');
    paymentButtons.forEach(button => {
        if (!isApproved) {
            button.disabled = true;
            button.title = 'Application must be approved to make tuition payments';
        } else {
            button.disabled = false;
            button.title = '';
        }
    });
}

function initializeDashboardTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const activePane = document.getElementById(`${tabId}Tab`);
            if (activePane) {
                activePane.classList.add('active');
            }
        });
    });
}

function initializePaymentButtons() {
    // Tuition payment buttons
    const payButtons = document.querySelectorAll('.pay-tuition-btn');
    
    payButtons.forEach(button => {
        button.addEventListener('click', async () => {
            if (!currentApplicationData) {
                showToast('Application data not found. Please refresh the page.', 'error');
                return;
            }
            
            // Check if application is approved
            if (!canPayTuition(currentApplicationData)) {
                showToast('Your application must be approved before you can pay tuition fees.', 'warning');
                return;
            }
            
            const paymentPlan = button.getAttribute('data-plan');
            currentApplicationData.paymentPlan = paymentPlan;
            
            // Save payment plan first
            const appRef = window.firebaseDoc(window.firebaseDb, 'applications', currentApplicationData.id);
            await window.firebaseSetDoc(appRef, {
                paymentPlan: paymentPlan,
                updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            }, { merge: true });
            
            // Initiate payment
            const paymentSuccess = await initiateTuitionPayment(currentApplicationData, paymentPlan);
            
            if (paymentSuccess) {
                showToast('Payment initiated. Please complete the payment process.', 'info');
            }
        });
    });
    
    // Monthly payment buttons (delegated event listener)
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('pay-month-btn')) {
            if (!currentApplicationData) {
                showToast('Application data not found. Please refresh the page.', 'error');
                return;
            }
            
            // Check if application is approved
            if (!canPayTuition(currentApplicationData)) {
                showToast('Your application must be approved before you can pay tuition fees.', 'warning');
                return;
            }
            
            const month = e.target.getAttribute('data-month');
            const paymentPlan = e.target.getAttribute('data-plan');
            
            const paymentSuccess = await initiateTuitionPayment(currentApplicationData, paymentPlan, month);
            
            if (paymentSuccess) {
                showToast('Monthly payment initiated. Please complete the payment process.', 'info');
            }
        }
    });
}

// Update showSection function to handle dashboard
export function showDashboardSection(applicationData) {
    const dashboardSection = document.getElementById('dashboardSection');
    const applicationSection = document.getElementById('applicationSection');
    const applicationStatus = document.getElementById('applicationStatus');
    
    if (dashboardSection) {
        dashboardSection.style.display = 'block';
        if (applicationSection) applicationSection.style.display = 'none';
        if (applicationStatus) applicationStatus.style.display = 'none';
        
        // Load dashboard data with real-time updates
        if (window.loadDashboardData) {
            window.loadDashboardData(applicationData.id, true);
        }
    } else {
        // Fallback to original status section
        showSection('status');
    }
}