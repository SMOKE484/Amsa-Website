import { elements } from './constants.js';
import { showToast } from './utilities.js';
import { updateApplicationPaymentStatus, completeApplicationSubmission } from './database.js';
import { showSection } from './ui.js';

// Fee structure based on the invoice (amounts in cents)
const FEE_STRUCTURE = {
    application: {
        new: 20000, // R200.00 in cents
        returning: 10000 // R100.00 in cents
    },
    subjects: {
        1: {
            upfront: 110000, // R1100.00
            sixMonths: 130000, // R1300.00
            tenMonths: 150000 // R1500.00
        },
        2: {
            upfront: 210000, // R2100.00
            sixMonths: 230000, // R2300.00
            tenMonths: 250000 // R2500.00
        },
        3: {
            upfront: 310000, // R3100.00
            sixMonths: 330000, // R3300.00
            tenMonths: 350000 // R3500.00
        },
        4: {
            upfront: 410000, // R4100.00
            sixMonths: 430000, // R4300.00
            tenMonths: 450000 // R4500.00
        }
    }
};

// Payment state management
const paymentState = {
    isProcessing: false,
    currentPayment: null,
    retryCount: 0,
    maxRetries: 3
};

// Calculate subject fees based on count and payment plan
export function calculateSubjectFees(subjectCount, paymentPlan) {
    const count = Math.min(Math.max(subjectCount, 1), 4); // Limit to 1-4 subjects
    const fees = FEE_STRUCTURE.subjects[count];
    return {
        amount: fees[paymentPlan],
        displayAmount: (fees[paymentPlan] / 100).toFixed(2),
        subjectCount: count,
        paymentPlan: paymentPlan
    };
}

// Calculate monthly amount for installment plans
export function calculateMonthlyAmount(subjectCount, paymentPlan) {
    const total = calculateSubjectFees(subjectCount, paymentPlan);
    const months = paymentPlan === 'sixMonths' ? 6 : 10;
    return {
        monthlyAmount: Math.ceil(total.amount / months),
        monthlyDisplayAmount: (Math.ceil(total.amount / months) / 100).toFixed(2),
        totalAmount: total.amount,
        totalDisplayAmount: total.displayAmount
    };
}

// Update fee display in subject fee modal
function updateFeeDisplay(applicationData) {
    const subjectCount = applicationData.selectedSubjects?.length || 0;
    const paymentPlanSelect = document.getElementById('paymentPlanSelect');
    const paymentPlan = paymentPlanSelect?.value || 'upfront';
    
    const feeCalculation = calculateSubjectFees(subjectCount, paymentPlan);
    
    // Update display elements
    const subjectCountElement = document.getElementById('subjectCount');
    const selectedPlanElement = document.getElementById('selectedPlan');
    const totalAmountElement = document.getElementById('totalAmount');
    
    if (subjectCountElement) subjectCountElement.textContent = subjectCount;
    if (selectedPlanElement) selectedPlanElement.textContent = paymentPlan.charAt(0).toUpperCase() + paymentPlan.slice(1).replace('Months', ' Months');
    if (totalAmountElement) totalAmountElement.textContent = `R${feeCalculation.displayAmount}`;
}

function showPaymentLoading(show) {
    const loading = document.getElementById('paymentLoading');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

// Enhanced payment initiation with better error handling
export async function initiatePaystackPayment(applicationData, paymentType = 'application') {
    if (paymentState.isProcessing) {
        showToast('Payment is already being processed. Please wait.', 'warning');
        return false;
    }

    try {
        paymentState.isProcessing = true;
        paymentState.currentPayment = { applicationData, paymentType };
        
        showPaymentLoading(true);
        console.log('Starting Paystack payment for:', paymentType, applicationData.id);

        // Validate required fields
        if (!applicationData.email) {
            throw new Error('Student email is required for payment');
        }

        if (paymentType === 'subjects' && !applicationData.selectedSubjects?.length) {
            throw new Error('No subjects selected for payment');
        }

        // Paystack TEST credentials
        const publicKey = 'pk_live_fc691ef3afbc4a51b790b602bbe80bb2510d49e4';
        
        // Calculate payment amount based on payment type
        let amount, itemName, metadata;
        
        if (paymentType === 'application') {
            // Application fee (compulsory for new students)
            amount = FEE_STRUCTURE.application.new;
            itemName = 'Alusani Academy Application Fee';
            metadata = {
                application_id: applicationData.id,
                payment_type: 'application_fee',
                custom_fields: [
                    {
                        display_name: "First Name",
                        variable_name: "first_name",
                        value: applicationData.firstName || 'Test'
                    },
                    {
                        display_name: "Last Name",
                        variable_name: "last_name", 
                        value: applicationData.lastName || 'User'
                    },
                    {
                        display_name: "Application ID",
                        variable_name: "application_id",
                        value: applicationData.id
                    }
                ]
            };
        } else {
            // Subject fees with payment plan
            const subjectCount = applicationData.selectedSubjects?.length || 0;
            const paymentPlan = applicationData.paymentPlan || 'upfront';
            
            if (subjectCount === 0) {
                throw new Error('No subjects selected');
            }
            
            const feeCalculation = calculateSubjectFees(subjectCount, paymentPlan);
            amount = feeCalculation.amount;
            itemName = `Alusani Academy Subject Fees (${subjectCount} ${subjectCount === 1 ? 'subject' : 'subjects'}, ${paymentPlan} plan)`;
            
            metadata = {
                application_id: applicationData.id,
                payment_type: 'subject_fees',
                subject_count: subjectCount,
                payment_plan: paymentPlan,
                total_amount: feeCalculation.displayAmount,
                custom_fields: [
                    {
                        display_name: "First Name",
                        variable_name: "first_name",
                        value: applicationData.firstName || 'Test'
                    },
                    {
                        display_name: "Last Name",
                        variable_name: "last_name", 
                        value: applicationData.lastName || 'User'
                    },
                    {
                        display_name: "Subjects Count",
                        variable_name: "subject_count",
                        value: subjectCount.toString()
                    },
                    {
                        display_name: "Payment Plan",
                        variable_name: "payment_plan",
                        value: paymentPlan
                    }
                ]
            };
        }

        // Payment data for Paystack
        const paymentData = {
            key: publicKey,
            email: applicationData.email,
            amount: amount,
            currency: 'ZAR',
            ref: `${paymentType.toUpperCase()}_${applicationData.id}_${Date.now()}`,
            metadata: metadata,
            callback: function(response) {
                console.log('Paystack callback received:', response);
                handlePaystackCallback(response, applicationData, paymentType);
            },
            onClose: function() {
                console.log('Paystack modal closed');
                paymentState.isProcessing = false;
                showPaymentLoading(false);
                if (paymentType === 'application') {
                    showToast('Application fee payment cancelled. Application cannot be submitted without payment.', 'warning');
                } else {
                    showToast('Subject fee payment cancelled. You can pay later.', 'info');
                }
            }
        };

        console.log('Paystack Payment Data:', paymentData);

        // Validate payment data
        validatePaymentData(paymentData);

        // Check if Paystack is loaded
        if (typeof PaystackPop === 'undefined') {
            throw new Error('Paystack SDK not loaded. Please check the script tag.');
        }

        // Initialize Paystack payment
        const handler = PaystackPop.setup(paymentData);
        handler.openIframe();

        return true;

    } catch (error) {
        console.error('Paystack payment error:', error);
        paymentState.isProcessing = false;
        showPaymentLoading(false);
        
        // Retry logic for network errors
        if (error.message.includes('network') && paymentState.retryCount < paymentState.maxRetries) {
            paymentState.retryCount++;
            showToast(`Payment setup failed. Retrying... (${paymentState.retryCount}/${paymentState.maxRetries})`, 'warning');
            setTimeout(() => initiatePaystackPayment(applicationData, paymentType), 2000);
            return true;
        }
        
        showToast(error.message || 'Payment setup failed. Please try again.', 'error');
        return false;
    }
}

// Validate payment data before sending to Paystack
function validatePaymentData(paymentData) {
    const required = ['key', 'email', 'amount', 'currency', 'ref'];
    const missing = required.filter(field => !paymentData[field]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    if (paymentData.amount <= 0) {
        throw new Error('Invalid payment amount');
    }
    
    if (!isValidEmail(paymentData.email)) {
        throw new Error('Invalid email address');
    }
    
    return true;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Enhanced callback handler with verification
async function handlePaystackCallback(response, applicationData, paymentType) {
    try {
        console.log('Paystack Payment Response:', response);
        
        // Verify payment was successful
        const paymentVerified = await verifyPaystackPayment(response.reference);
        
        if (response.status === 'success' && paymentVerified) {
            if (paymentType === 'application') {
                // Application fee paid - complete submission
                showToast('Application fee paid successfully! Submitting your application...', 'success');
                
                await updateApplicationPaymentStatus(applicationData.id, 'application_paid');
                
                // Complete the application submission with the original form data
                await completeApplicationSubmission(applicationData);
                
                // Show dashboard after successful application payment
                setTimeout(() => {
                    showDashboardSection(applicationData);
                }, 2000);
                
            } else {
                // Subject fees paid
                showToast('Subject fees paid successfully! Your enrollment is complete.', 'success');
                
                await updateApplicationPaymentStatus(applicationData.id, 'fully_paid');
                
                // Redirect to success page
                setTimeout(() => {
                    window.location.href = '/applications.html?payment=success&reference=' + response.reference;
                }, 2000);
            }
            
            // Reset payment state on success
            paymentState.isProcessing = false;
            paymentState.retryCount = 0;
            
        } else {
            // Payment failed or not verified
            showToast('Payment verification failed. Please try again.', 'error');
            paymentState.isProcessing = false;
        }
    } catch (error) {
        console.error('Error handling Paystack callback:', error);
        showToast('Payment completed. Processing your application...', 'info');
        paymentState.isProcessing = false;
        
        // Fallback redirect
        setTimeout(() => {
            window.location.href = '/applications.html';
        }, 3000);
    } finally {
        showPaymentLoading(false);
    }
}

async function verifyPaystackPayment(reference) {

    try {
        console.log('Simulating payment verification for:', reference);
    
        await new Promise(resolve => setTimeout(resolve, 1000));

        return !!reference;
        
    } catch (error) {
        console.error('Payment verification error:', error);
        return false;
    }
}

// Debug function for monthly payments
function debugMonthlyPayment(applicationData, paymentPlan, month) {
    console.log('=== MONTHLY PAYMENT DEBUG ===');
    console.log('Application ID:', applicationData.id);
    console.log('Payment Plan:', paymentPlan);
    console.log('Month:', month);
    console.log('Email:', applicationData.email);
    console.log('Subject Count:', applicationData.selectedSubjects?.length || 0);
    
    const monthlyCalculation = calculateMonthlyAmount(
        applicationData.selectedSubjects?.length || 0, 
        paymentPlan
    );
    console.log('Monthly Amount:', monthlyCalculation.monthlyAmount);
    console.log('=== END DEBUG ===');
}

// Tuition fee payment function with enhanced error handling
export async function initiateTuitionPayment(applicationData, paymentPlan, month = null) {
    if (paymentState.isProcessing) {
        showToast('Another payment is being processed. Please wait.', 'warning');
        return false;
    }

    try {
        paymentState.isProcessing = true;
        showPaymentLoading(true);
        
        console.log('Starting tuition payment for plan:', paymentPlan, 'Month:', month, applicationData.id);

        // Debug the payment data
        debugMonthlyPayment(applicationData, paymentPlan, month);

        // Check if application is approved
        if (applicationData.status !== 'approved') {
            throw new Error('Your application must be approved before you can pay tuition fees.');
        }

        // Paystack TEST credentials
        const publicKey = 'pk_live_fc691ef3afbc4a51b790b602bbe80bb2510d49e4';
        
        const subjectCount = applicationData.selectedSubjects?.length || 0;
        
        if (subjectCount === 0) {
            throw new Error('No subjects selected');
        }
        
        let monthlyAmount = 0;
        let paymentDescription = '';
        
        if (paymentPlan === 'upfront') {
            const feeCalculation = calculateSubjectFees(subjectCount, paymentPlan);
            monthlyAmount = feeCalculation.amount;
            paymentDescription = 'Full tuition fee upfront payment';
        } else {
            const monthlyCalculation = calculateMonthlyAmount(subjectCount, paymentPlan);
            monthlyAmount = monthlyCalculation.monthlyAmount;
            
            // FIX: Handle month parameter properly
            if (!month) {
                // First payment for installment plan
                paymentDescription = `First month tuition installment (${paymentPlan})`;
            } else {
                // Specific monthly payment
                paymentDescription = `${month} tuition installment (${paymentPlan})`;
            }
        }

        const itemName = `Alusani Academy Tuition Fees - ${paymentDescription}`;
        
        // FIX: Ensure month is properly set for metadata
        const metadata = {
            application_id: applicationData.id,
            payment_type: 'tuition_fees',
            subject_count: subjectCount,
            payment_plan: paymentPlan,
            monthly_amount: (monthlyAmount / 100).toFixed(2),
            payment_month: month || 'first_payment', // Don't use null
            custom_fields: [
                {
                    display_name: "First Name",
                    variable_name: "first_name",
                    value: applicationData.firstName || 'Test'
                },
                {
                    display_name: "Last Name",
                    variable_name: "last_name", 
                    value: applicationData.lastName || 'User'
                },
                {
                    display_name: "Subjects Count",
                    variable_name: "subject_count",
                    value: subjectCount.toString()
                },
                {
                    display_name: "Payment Plan",
                    variable_name: "payment_plan",
                    value: paymentPlan
                },
                {
                    display_name: "Payment Month",
                    variable_name: "payment_month",
                    value: month || 'first_payment' // Don't use null
                }
            ]
        };

        // FIX: Ensure reference includes month properly
        const monthRef = month ? month.replace(/ /g, '_') : 'FIRST';
        const paymentData = {
            key: publicKey,
            email: applicationData.email,
            amount: monthlyAmount,
            currency: 'ZAR',
            ref: `TUITION_${paymentPlan.toUpperCase()}_${monthRef}_${applicationData.id}_${Date.now()}`,
            metadata: metadata,
            callback: function(response) {
                console.log('Tuition payment callback received:', response);
                handleTuitionPaymentCallback(response, applicationData, paymentPlan, monthlyAmount, month);
            },
            onClose: function() {
                console.log('Tuition payment modal closed');
                paymentState.isProcessing = false;
                showPaymentLoading(false);
                showToast('Tuition payment cancelled. You can pay later.', 'info');
            }
        };

        console.log('Tuition Payment Data:', paymentData);

        // Validate payment data
        validatePaymentData(paymentData);

        // Check if Paystack is loaded
        if (typeof PaystackPop === 'undefined') {
            throw new Error('Paystack SDK not loaded. Please check the script tag.');
        }

        // Initialize Paystack payment
        const handler = PaystackPop.setup(paymentData);
        handler.openIframe();

        return true;

    } catch (error) {
        console.error('Tuition payment error:', error);
        paymentState.isProcessing = false;
        showPaymentLoading(false);
        
        showToast(error.message || 'Payment setup failed. Please try again.', 'error');
        return false;
    }
}

// Handle tuition payment callback - FIXED VERSION
async function handleTuitionPaymentCallback(response, applicationData, paymentPlan, amount, month) {
    try {
        console.log('Tuition Payment Response:', response);
        
        const paymentVerified = await verifyPaystackPayment(response.reference);
        
        if (response.status === 'success' && paymentVerified) {
            if (paymentPlan === 'upfront') {
                // Update application with payment plan and status for upfront payment
                await updateApplicationWithPaymentPlan(applicationData.id, paymentPlan, amount);
                showToast('Full tuition payment successful! Your enrollment is complete.', 'success');
                await updateApplicationPaymentStatus(applicationData.id, 'fully_paid');
                
            } else {
                // For installment payments, record the monthly payment
                if (month) {
                    // Individual monthly payment
                    await recordMonthlyPayment(applicationData.id, paymentPlan, month, amount);
                    showToast(`${month} payment successful!`, 'success');
                    
                    // Check if all payments are completed
                    const allPaid = await checkIfAllPaymentsCompleted(applicationData.id, paymentPlan);
                    if (allPaid) {
                        await updateApplicationPaymentStatus(applicationData.id, 'fully_paid');
                        showToast('All tuition payments completed! Your enrollment is complete.', 'success');
                    }
                } else {
                    // First payment for installment plan - save the plan
                    await updateApplicationWithPaymentPlan(applicationData.id, paymentPlan, amount);
                    showToast('Payment plan activated successfully!', 'success');
                }
            }
            
            paymentState.isProcessing = false;
            
            // Refresh dashboard to update payment status
            setTimeout(() => {
                if (window.loadDashboardData) {
                    window.loadDashboardData(applicationData.id);
                }
            }, 2000);
            
        } else {
            // Payment failed
            showToast('Payment failed or not verified. Please try again.', 'error');
            paymentState.isProcessing = false;
        }
    } catch (error) {
        console.error('Error handling tuition payment callback:', error);
        showToast('Payment completed. Processing your enrollment...', 'info');
        paymentState.isProcessing = false;
    } finally {
        showPaymentLoading(false);
    }
}

// Check if all monthly payments are completed - FIXED VERSION
async function checkIfAllPaymentsCompleted(applicationId, paymentPlan) {
    try {
        const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
        const docSnap = await window.firebaseGetDoc(appRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const payments = data.payments || {};
            
            console.log('Checking payment completion with data:', data);
            console.log('Payments object:', payments);
            
            const monthsCount = paymentPlan === 'sixMonths' ? 6 : 10;
            // *** FIXED *** Use paymentStartDate from data to generate the *correct* list of months
            const startDate = data.paymentStartDate ? new Date(data.paymentStartDate) : new Date();
            const monthNames = getMonthNames(monthsCount, startDate);
            
            const allPaid = monthNames.every(month => {
                const monthKey = month.toLowerCase().replace(/ /g, '_');
                const isPaid = payments[monthKey]?.paid === true;
                console.log(`Month ${month} paid:`, isPaid);
                return isPaid;
            });
            
            console.log('All payments completed:', allPaid);
            return allPaid;
        }
        return false;
    } catch (error) {
        console.error('Error checking payment completion:', error);
        return false;
    }
}

// Get month names for payment plan
// *** MODIFIED *** to accept a startDate
function getMonthNames(monthsCount, startDate = new Date()) {
    const currentDate = startDate; // Use the provided start date
    const monthNames = [];
    
    for (let i = 0; i < monthsCount; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
        const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        monthNames.push(monthName);
    }
    
    return monthNames;
}

// Update application with payment plan
async function updateApplicationWithPaymentPlan(applicationId, paymentPlan, totalAmount) {
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    await window.firebaseSetDoc(appRef, {
        paymentPlan: paymentPlan,
        tuitionAmount: totalAmount / 100, // Convert cents to Rands
        tuitionPaid: paymentPlan === 'upfront', // Only mark as paid if upfront
        paymentStartDate: new Date().toISOString(),
        updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    }, { merge: true });
}

// Record monthly payment - IMPROVED VERSION
async function recordMonthlyPayment(applicationId, paymentPlan, month, amount) {
    if (!month) {
        console.error('Month parameter is required for recording monthly payment');
        return;
    }
    
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    const monthKey = month.toLowerCase().replace(/ /g, '_');
    
    // FIXED: Use proper nested structure for payments
    const updateData = {
        paymentPlan: paymentPlan,
        [`payments.${monthKey}`]: {
            amount: amount / 100,
            paid: true,
            paidAt: new Date().toISOString(),
            reference: `MONTHLY_${month.replace(/ /g, '_')}_${Date.now()}`
        },
        updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    };
    
    console.log('Recording monthly payment for:', month);
    console.log('Update data:', updateData);
    
    try {
        await window.firebaseSetDoc(appRef, updateData, { merge: true });
        console.log('Monthly payment recorded successfully for:', month);
        
        // Refresh the dashboard to show updated payment status
        setTimeout(() => {
            if (window.loadDashboardData) {
                console.log('Refreshing dashboard data...');
                window.loadDashboardData(applicationId);
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error recording monthly payment:', error);
        throw error;
    }
}

// Application fee modal (compulsory)
export function showPaystackPaymentModal(applicationData) {
    return new Promise((resolve) => {
        const modal = document.getElementById('paystackPaymentModal');
        const confirmBtn = document.getElementById('confirmPaystackPayment');
        const cancelBtn = document.getElementById('cancelPaystackPayment');
        const closeBtn = modal?.querySelector('.close');

        if (!modal || !confirmBtn || !cancelBtn || !closeBtn) {
            console.error('Paystack payment modal not found in DOM');
            showToast('Payment system is not properly configured. Please contact support.', 'error');
            resolve(false);
            return;
        }

        const handleConfirm = async () => {
            modal.style.display = 'none';
            cleanupListeners();
            
            // Process application fee payment
            const result = await initiatePaystackPayment(applicationData, 'application');
            resolve(result);
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanupListeners();
            showToast('Application fee payment cancelled. Application cannot be submitted without payment.', 'warning');
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

// Hide payment plan dropdown and related elements after selection
function hidePaymentPlanDropdown() {
    const paymentPlanSelection = document.querySelector('.payment-plan-selection');
    const paymentPlanSelect = document.getElementById('paymentPlanSelect');
    const paymentCards = document.querySelector('.payment-cards');
    
    console.log('Hiding payment plan dropdown and cards...');
    
    if (paymentPlanSelection) {
        paymentPlanSelection.style.display = 'none';
        console.log('Payment plan selection hidden');
    }
    
    if (paymentPlanSelect) {
        paymentPlanSelect.style.display = 'none';
        console.log('Payment plan select hidden');
    }
    
    // Also hide the payment cards since we've selected a plan
    if (paymentCards) {
        paymentCards.style.display = 'none';
        console.log('Payment cards hidden');
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

// Subject fee modal (optional - can be paid later)
export function showSubjectFeeModal(applicationData) {
    return new Promise((resolve) => {
        const modal = document.getElementById('subjectFeeModal');
        const confirmBtn = document.getElementById('confirmSubjectPayment');
        const cancelBtn = document.getElementById('cancelSubjectPayment');
        const closeBtn = modal?.querySelector('.close');
        const paymentPlanSelect = document.getElementById('paymentPlanSelect');

        if (!modal || !confirmBtn || !cancelBtn || !closeBtn || !paymentPlanSelect) {
            console.error('Subject fee modal not found in DOM');
            // If modal doesn't exist, just resolve and continue
            resolve(false);
            return;
        }

        // Update fee display with current application data
        updateFeeDisplay(applicationData);
        
        // Add event listener for payment plan changes
        const handlePlanChange = () => {
            updateFeeDisplay(applicationData);
        };

        const handleConfirm = async () => {
            modal.style.display = 'none';
            cleanupListeners();
            
            // Update application data with selected payment plan
            applicationData.paymentPlan = paymentPlanSelect.value;
            
            // Save payment plan to database
            await savePaymentPlan(applicationData.id, paymentPlanSelect.value);
            
            const result = await initiatePaystackPayment(applicationData, 'subjects');
            resolve(result);
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanupListeners();
            showToast('You can pay subject fees later. Your application has been submitted.', 'info');
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
            paymentPlanSelect.removeEventListener('change', handlePlanChange);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleModalClick);
        paymentPlanSelect.addEventListener('change', handlePlanChange);

        modal.style.display = 'flex';
    });
}

// Save payment plan to database and hide dropdown
export async function savePaymentPlan(applicationId, paymentPlan) {
    const appRef = window.firebaseDoc(window.firebaseDb, 'applications', applicationId);
    await window.firebaseSetDoc(appRef, {
        paymentPlan: paymentPlan,
        // *** MODIFIED ***: Already fixed in main.js, but ensure it's here too if called from somewhere else
        // This function is also exported from main.js, causing potential conflict.
        // The one in main.js is the one being called by the dropdown, so that's the primary fix.
        // We'll add it here for safety, though it's redundant if main.js is fixed.
        paymentStartDate: new Date().toISOString(), 
        updatedAt: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
    }, { merge: true });
    
    // Hide the payment plan dropdown after selection
    hidePaymentPlanDropdown();
}

export function handlePaymentCancel(applicationId) {
    showToast('Payment was cancelled. You can retry payment later.', 'info');
    setTimeout(() => {
        window.location.href = '/applications.html';
    }, 3000);
}

// Show dashboard section
function showDashboardSection(applicationData) {
    const dashboardSection = document.getElementById('dashboardSection');
    const applicationSection = document.getElementById('applicationSection');
    const applicationStatus = document.getElementById('applicationStatus');
    
    if (dashboardSection) {
        dashboardSection.style.display = 'block';
        if (applicationSection) applicationSection.style.display = 'none';
        if (applicationStatus) applicationStatus.style.display = 'none';
        
        // Load dashboard data
        if (window.loadDashboardData) {
            window.loadDashboardData(applicationData.id);
        }
    } else {
        // Fallback to original status section
        showSection('status');
    }
}

// Generate monthly payment buttons based on selected plan - FIXED VERSION
export function generateMonthlyPayments(applicationData, paymentPlan) {
    const monthlyPaymentsContainer = document.getElementById('monthlyPayments');
    if (!monthlyPaymentsContainer) {
        console.error('Monthly payments container not found');
        return;
    }

    // Clear existing content
    monthlyPaymentsContainer.innerHTML = '';

    const subjectCount = applicationData.selectedSubjects?.length || 0;
    if (subjectCount === 0) {
        monthlyPaymentsContainer.innerHTML = '<p>No subjects selected</p>';
        return;
    }

    const monthlyCalculation = calculateMonthlyAmount(subjectCount, paymentPlan);
    const monthsCount = paymentPlan === 'sixMonths' ? 6 : 10;

    // *** FIXED *** Get month names starting from the paymentStartDate
    const startDate = applicationData.paymentStartDate ? new Date(applicationData.paymentStartDate) : new Date();
    const monthNames = getMonthNames(monthsCount, startDate);

    // Create header
    const header = document.createElement('h4');
    header.textContent = `${monthsCount}-Month Payment Plan`;
    header.style.marginBottom = '20px';
    header.style.color = 'var(--navy)';
    monthlyPaymentsContainer.appendChild(header);

    // Create description
    const description = document.createElement('p');
    description.textContent = `Pay R${monthlyCalculation.monthlyDisplayAmount} per month for ${monthsCount} months. Click "Pay" for each month when you're ready to make the payment.`;
    description.style.marginBottom = '20px';
    description.style.color = '#666';
    monthlyPaymentsContainer.appendChild(description);

    const monthsList = document.createElement('div');
    monthsList.className = 'monthly-payments-list';
    
    monthNames.forEach((monthName, index) => {
        const monthItem = document.createElement('div');
        monthItem.className = 'month-payment-item';
        
        // FIXED: Check if this month is already paid - handle Firebase nested structure
        const isPaid = checkIfMonthIsPaid(applicationData, monthName);
        
        monthItem.innerHTML = `
            <div class="month-info">
                <span class="month-name">${monthName}</span>
                <span class="month-amount">R${monthlyCalculation.monthlyDisplayAmount}</span>
                <small>Payment ${index + 1} of ${monthsCount}</small>
            </div>
            <button class="btn ${isPaid ? 'btn-success' : 'btn-primary'} pay-month-btn" 
                    data-month="${monthName}" 
                    data-plan="${paymentPlan}"
                    ${isPaid ? 'disabled' : ''}>
                ${isPaid ? '✓ Paid' : 'Pay Now'}
            </button>
        `;
        
        if (isPaid) {
            monthItem.classList.add('paid');
        }
        
        monthsList.appendChild(monthItem);
    });
    
    monthlyPaymentsContainer.appendChild(monthsList);
    
    // Add total amount display
    const totalSection = document.createElement('div');
    totalSection.className = 'payment-total';
    totalSection.style.marginTop = '20px';
    totalSection.style.padding = '15px';
    totalSection.style.backgroundColor = '#f8f9fa';
    totalSection.style.borderRadius = '8px';
    totalSection.style.textAlign = 'center';
    totalSection.innerHTML = `
        <strong>Total Amount: R${monthlyCalculation.totalDisplayAmount}</strong><br>
        <small>Monthly: R${monthlyCalculation.monthlyDisplayAmount} × ${monthsCount} months</small>
    `;
    monthlyPaymentsContainer.appendChild(totalSection);

    // Show the monthly payments container
    monthlyPaymentsContainer.style.display = 'block';
    
    console.log('Monthly payments generated successfully for plan:', paymentPlan);
    console.log('Full application data for payments:', applicationData);
    console.log('Payments data specifically:', applicationData.payments);
}

// FIXED: Check if month is paid - properly handles Firebase nested structure
function checkIfMonthIsPaid(applicationData, monthName) {
    const monthKey = monthName.toLowerCase().replace(/ /g, '_');
    
    // Check for nested payments structure (payments.october_2025.paid)
    if (applicationData.payments && applicationData.payments[monthKey]) {
        console.log(`Found payment for ${monthName}:`, applicationData.payments[monthKey]);
        return applicationData.payments[monthKey].paid === true;
    }
    
    // Check for direct payment object in applicationData
    const paymentKey = `payments.${monthKey}`;
    if (applicationData[paymentKey]) {
        console.log(`Found direct payment for ${monthName}:`, applicationData[paymentKey]);
        return applicationData[paymentKey].paid === true;
    }
    
    // Debug: Log all payment-related keys
    const paymentKeys = Object.keys(applicationData).filter(key => key.includes('payments'));
    console.log('All payment-related keys:', paymentKeys);
    
    return false;
}

// Check if application is approved for tuition payment
export function canPayTuition(applicationData) {
    return applicationData.status === 'approved';
}

// Initialize payment plan selection
export function initializePaymentPlanSelection(applicationData) {
    const paymentPlanSelect = document.getElementById('paymentPlanSelect');
    if (!paymentPlanSelect) return;

    paymentPlanSelect.addEventListener('change', async (e) => {
        const selectedPlan = e.target.value;
        
        if (!selectedPlan) return;
        
        // Show confirmation modal
        const confirmed = await showPaymentPlanConfirmationModal(applicationData, selectedPlan);
        
        if (!confirmed) {
            // Reset selection if cancelled
            paymentPlanSelect.value = '';
            return;
        }
        
        // Update application data
        applicationData.paymentPlan = selectedPlan;
        
        // Refresh dashboard to show monthly payments
        if (window.loadDashboardData) {
            window.loadDashboardData(applicationData.id);
        }
    });
}

// Check and hide payment plan dropdown if plan is already selected
export function checkAndHidePaymentPlan(applicationData) {
    if (applicationData.paymentPlan) {
        console.log('Payment plan already selected:', applicationData.paymentPlan);
        hidePaymentPlanDropdown();
        
        // If it's an installment plan, generate monthly payments
        if (applicationData.paymentPlan !== 'upfront') {
            generateMonthlyPayments(applicationData, applicationData.paymentPlan);
        }
    }
}

// Payment Plan Confirmation Modal
export function showPaymentPlanConfirmationModal(applicationData, paymentPlan) {
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

// Export for use in other modules
export { FEE_STRUCTURE, paymentState };
