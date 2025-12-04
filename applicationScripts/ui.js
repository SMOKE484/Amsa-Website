// ui.js

import { elements, subjects } from './constants.js';
import { updateProgressIndicator } from './utilities.js';
// Import necessary payment functions used by the UI updates
import { calculateSubjectFees, calculateMonthlyAmount, generateMonthlyPayments } from './payments.js';

/**
 * Shows the specified section and hides others.
 * @param {string} section - The ID suffix of the section to show (e.g., 'application', 'dashboard').
 */
export function showSection(section) {
    // Hide all main sections first
    const sections = [
        elements.applicationSection,
        elements.consentSection,
        elements.rulesSection,
        elements.pledgeSection,
        elements.applicationStatus, // Simple status page
        elements.existingApplication,
        elements.dashboardSection   // Full dashboard
    ];

    sections.forEach(sec => {
        if (sec) sec.style.display = 'none';
    });

    // Show the target section
    const targetSection = document.getElementById(`${section}Section`) || document.getElementById(section); // Handle simple status ID
    if (targetSection) {
        targetSection.style.display = 'block';
    } else {
        console.error(`Section '${section}' not found.`);
        // Fallback or show error message
        if (elements.applicationSection) elements.applicationSection.style.display = 'block'; // Fallback to application form
    }

    // Toggle start button visibility (only show if viewing application form initially)
    if (elements.startApplicationBtn) {
        // Show only if the target is application *and* maybe some other condition (like user logged in but no app started)
        // Hiding it by default after initial load might be safer. Let main.js control its display logic.
        // elements.startApplicationBtn.style.display = (section === 'application') ? 'inline-flex' : 'none';
    }

    // Update progress indicator based on the section
    updateProgressIndicator(section);
}

/**
 * Updates the subject checkboxes based on the selected grade.
 * @param {string} grade - The selected grade value (e.g., '8', '10').
 */
export function updateSubjects(grade) {
    if (!elements.subjectsContainer) {
        console.warn('Subjects container not found.');
        return;
    }

    // Preserve currently selected subjects if any
    const selected = Array.from(document.querySelectorAll('input[name="subjects"]:checked')).map(cb => cb.value);

    elements.subjectsContainer.innerHTML = ''; // Clear previous subjects
    if (!grade) {
        console.warn('No grade selected, cannot update subjects.');
        return;
    }

    const fragment = document.createDocumentFragment();
    // Determine subject category based on grade
    let gradeCategory = '8-9'; // Default
    const gradeNum = parseInt(grade);
    if (gradeNum >= 10 && gradeNum <= 12) {
        gradeCategory = '10-12';
    } else if (gradeNum < 8 || gradeNum > 12) {
        console.warn(`Invalid grade '${grade}' selected.`);
        return; // Don't show subjects for invalid grades
    }


    if (!subjects[gradeCategory]) {
         console.error(`Subjects for grade category '${gradeCategory}' not found in constants.`);
         return;
    }

    // Create checkboxes for the relevant subjects
    subjects[gradeCategory].forEach(subject => {
        const div = document.createElement('div');
        div.className = 'subject-checkbox';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'subjects';
        input.value = subject;
        input.id = `sub-${subject.replace(/\s+/g, '-')}`;
        // Re-check if it was previously selected
        if (selected.includes(subject)) {
            input.checked = true;
        }

        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.textContent = subject;

        div.appendChild(input);
        div.appendChild(label);
        fragment.appendChild(div);
    });

    elements.subjectsContainer.appendChild(fragment);
}


// --- DASHBOARD UI UPDATE FUNCTIONS ---

/**
 * Updates the entire dashboard UI based on the provided application data.
 * @param {object} data - The application data object from Firestore.
 */
export function updateDashboardUI(data) {
    try {
        if (!data) {
            console.warn("updateDashboardUI called with null or undefined data.");
            // Optionally hide dashboard or show an error state
            return;
        }
        console.log("Updating dashboard UI with data:", data);

        // Update basic info panel
        updateBasicInfo(data);
        // Update application status display and timeline
        updateApplicationStatusDisplay(data);
        // Update payment amounts shown in payment options
        updatePaymentAmounts(data);
        // Update fee status badges (App Fee / Tuition Fee)
        updateStatusBadges(data);
        // Update the summary section on the status tab
        updateSummarySection(data);
        // Show/hide payment cards vs monthly list based on plan and status
        updatePaymentDisplay(data); // This now also handles generating monthly payments if needed


    } catch (error) {
        console.error('Error updating dashboard UI:', error);
        // Consider showing a user-friendly error message via showToast
        // showToast('Error updating dashboard display', 'error');
    }
}

/**
 * Updates the basic student information displayed on the dashboard.
 * @param {object} applicationData - The application data.
 */
function updateBasicInfo(applicationData) {
    const appIdElement = document.getElementById('dashboardAppId'); // Assuming ID for Application ID display
    const studentNameElement = document.getElementById('dashboardStudentName');
    const gradeElement = document.getElementById('dashboardGrade');
    const subjectsElement = document.getElementById('dashboardSubjects');

    // Safely update elements, providing defaults
    if (appIdElement) appIdElement.textContent = applicationData.id || 'N/A';
    if (studentNameElement) studentNameElement.textContent = `${applicationData.firstName || ''} ${applicationData.lastName || ''}`.trim() || 'N/A';
    if (gradeElement) gradeElement.textContent = applicationData.grade ? `Grade ${applicationData.grade}` : 'N/A';
    if (subjectsElement) subjectsElement.textContent = applicationData.selectedSubjects?.length > 0 ? applicationData.selectedSubjects.join(', ') : 'No subjects selected';
}

/**
 * Updates the main status badge, description text, and timeline on the dashboard.
 * @param {object} applicationData - The application data.
 */
function updateApplicationStatusDisplay(applicationData) {
    const statusBadgeElement = document.getElementById('applicationStatusBadge');
    const statusTextElement = document.getElementById('applicationStatusText'); // In summary section

    if (!statusBadgeElement) {
         console.warn("Element with ID 'applicationStatusBadge' not found.");
    }
     if (!statusTextElement) {
         console.warn("Element with ID 'applicationStatusText' not found.");
    }

    if (statusBadgeElement) {
        const status = applicationData.status || 'submitted'; // Default to submitted if missing
        const statusText = getStatusText(status); // Use helper for display text

        statusBadgeElement.textContent = statusText;
        // Ensure CSS classes match possible statuses
        statusBadgeElement.className = `status-badge status-${status}`;
    }
     if (statusTextElement) {
          const status = applicationData.status || 'submitted';
          const statusDescription = getStatusDescription(status); // Use helper for description
          statusTextElement.textContent = statusDescription; // Update summary text
     }

    // Update the visual timeline based on the current status
    updateTimeline(applicationData);
}

/**
 * Updates the visual status timeline based on application status and updates.
 * @param {object} applicationData - The application data.
 */
function updateTimeline(applicationData) {
    const timelineItems = {
        Application: document.getElementById('timelineApplication'),
        Review: document.getElementById('timelineReview'),
        Approval: document.getElementById('timelineApproval'),
        Enrollment: document.getElementById('timelineEnrollment')
    };

    const status = applicationData.status || 'submitted';
    // Ensure statusUpdates is an array, default to empty if null/undefined
    const updates = Array.isArray(applicationData.statusUpdates) ? applicationData.statusUpdates : [];
    const submittedAt = applicationData.submittedAt;

    // Reset classes for all items
    Object.values(timelineItems).forEach(item => {
        if (item) item.className = 'timeline-item'; // Reset to base class
    });

    // --- Logic to set 'completed' and 'current' ---

    // Application Submitted (always completed if data exists)
    if (timelineItems.Application) {
        timelineItems.Application.classList.add('completed');
        const dateEl = timelineItems.Application.querySelector('.timeline-date');
        // Safely format date, checking if it's a Firestore Timestamp or Date object
        if (dateEl && submittedAt) dateEl.textContent = formatDate(submittedAt);
    }

    // Under Review
    const reviewUpdate = updates.find(u => u.status === 'under-review');
    if (status === 'under-review' || status === 'approved' || status === 'rejected') {
         if (timelineItems.Review) timelineItems.Review.classList.add('completed');
         const dateEl = timelineItems.Review?.querySelector('.timeline-date');
         if (dateEl && reviewUpdate?.timestamp) dateEl.textContent = formatDate(reviewUpdate.timestamp);
    }
    // Set 'current' if this is the active step
    if (status === 'submitted') { // Current step is Review if just Submitted
         if (timelineItems.Review) timelineItems.Review.classList.add('current');
    }

    // Approval
    const approvalUpdate = updates.find(u => u.status === 'approved');
    const rejectionUpdate = updates.find(u => u.status === 'rejected');
    if (status === 'approved' || status === 'rejected') {
         if (timelineItems.Approval) timelineItems.Approval.classList.add('completed');
         const decisionUpdate = approvalUpdate || rejectionUpdate; // Get timestamp from either
         const dateEl = timelineItems.Approval?.querySelector('.timeline-date');
         if (dateEl && decisionUpdate?.timestamp) dateEl.textContent = formatDate(decisionUpdate.timestamp);

         // Add specific styling for rejected status
         if (status === 'rejected' && timelineItems.Approval) {
              timelineItems.Approval.classList.add('rejected'); // Use this class for styling
         }
    }
    // Set 'current' if this is the active step
     if (status === 'under-review') { // Current step is Approval if Under Review
         if (timelineItems.Approval) timelineItems.Approval.classList.add('current');
    }

    // Enrollment Complete (Completed only when approved AND fully paid)
    const isFullyPaid = applicationData.paymentStatus === 'fully_paid';
     if (status === 'approved' && isFullyPaid) {
         if (timelineItems.Enrollment) timelineItems.Enrollment.classList.add('completed');
         // We might not have a distinct 'enrollment' timestamp.
         // Use the approval timestamp or maybe the last payment timestamp?
         // For simplicity, let's use the approval timestamp if available.
         const dateEl = timelineItems.Enrollment?.querySelector('.timeline-date');
         if (dateEl && approvalUpdate?.timestamp) dateEl.textContent = formatDate(approvalUpdate.timestamp);
         else if (dateEl) dateEl.textContent = "Completed"; // Fallback text
    }
    // Set 'current' if this is the active step
     if (status === 'approved' && !isFullyPaid) { // Current step is Enrollment/Payment if Approved but not paid
         if (timelineItems.Enrollment) timelineItems.Enrollment.classList.add('current');
    }
}

/**
 * Updates the displayed payment amounts in the payment plan cards.
 * @param {object} applicationData - The application data.
 */
function updatePaymentAmounts(applicationData) {
    const subjectCount = applicationData.selectedSubjects?.length || 0;

    // If no subjects, maybe display N/A or default text
    if (subjectCount === 0) {
        console.warn("No subjects selected; payment amounts cannot be calculated.");
        // Set display elements to indicate this state
        const elementsToUpdate = [
             document.getElementById('subjectFeeAmountDisplay'),
             document.getElementById('upfrontAmount'),
             document.getElementById('sixMonthsMonthly'),
             document.getElementById('tenMonthsMonthly'),
             document.getElementById('sixMonthsTotal'),
             document.getElementById('tenMonthsTotal')
        ];
        elementsToUpdate.forEach(el => { if (el) el.textContent = 'N/A'; });
        return;
    }

     // Clamp count between 1 and 4 for fee calculation
     const count = Math.min(Math.max(subjectCount, 1), 4);

    try {
        // Calculate fees using helpers (ensure they are available)
        const upfrontFee = calculateSubjectFees(count, 'upfront');
        const sixMonthsFee = calculateSubjectFees(count, 'sixMonths');
        const tenMonthsFee = calculateSubjectFees(count, 'tenMonths');
        const sixMonthsMonthlyCalc = calculateMonthlyAmount(count, 'sixMonths');
        const tenMonthsMonthlyCalc = calculateMonthlyAmount(count, 'tenMonths');

        // Get elements for display
        const subjectFeeDisplay = document.getElementById('subjectFeeAmountDisplay');
        const upfrontAmountEl = document.getElementById('upfrontAmount');
        const sixMonthsMonthlyEl = document.getElementById('sixMonthsMonthly');
        const tenMonthsMonthlyEl = document.getElementById('tenMonthsMonthly');
        const sixMonthsTotalEl = document.getElementById('sixMonthsTotal');
        const tenMonthsTotalEl = document.getElementById('tenMonthsTotal');

        // Safely update text content with calculated display amounts
        if (subjectFeeDisplay) subjectFeeDisplay.textContent = `R${upfrontFee.displayAmount || '0.00'}`; // Show upfront as default tuition fee display
        if (upfrontAmountEl) upfrontAmountEl.textContent = `R${upfrontFee.displayAmount || '0.00'}`;
        if (sixMonthsMonthlyEl) sixMonthsMonthlyEl.textContent = `R${sixMonthsMonthlyCalc.monthlyDisplayAmount || '0.00'}/month`;
        if (tenMonthsMonthlyEl) tenMonthsMonthlyEl.textContent = `R${tenMonthsMonthlyCalc.monthlyDisplayAmount || '0.00'}/month`;
        if (sixMonthsTotalEl) sixMonthsTotalEl.textContent = `R${sixMonthsFee.displayAmount || '0.00'}`;
        if (tenMonthsTotalEl) tenMonthsTotalEl.textContent = `R${tenMonthsFee.displayAmount || '0.00'}`;

    } catch (error) {
        console.error('Error calculating or updating payment amounts:', error);
        // Optionally update UI to show an error state
    }
}

/**
 * Updates the "Paid"/"Pending" status badges for Application Fee and Tuition Fees.
 * @param {object} applicationData - The application data.
 */
function updateStatusBadges(applicationData) {
    const paymentStatus = applicationData.paymentStatus || 'pending'; // Default to pending

    // Application Fee Status Elements
    const appFeeStatusSummary = document.getElementById('appFeeStatus'); // In summary grid on Status Tab
    const appFeeStatusBadgePayments = document.getElementById('appFeeStatusBadge'); // In fee card on Payments Tab

    // Determine if Application Fee is considered paid
    const isAppFeePaid = paymentStatus === 'application_paid' || paymentStatus === 'fully_paid';

    // Update Application Fee status in Summary Grid
    if (appFeeStatusSummary) {
        appFeeStatusSummary.textContent = isAppFeePaid ? 'Paid' : 'Pending';
        appFeeStatusSummary.className = isAppFeePaid ? 'status-paid' : 'status-pending'; // Ensure these CSS classes exist
    }
    // Update Application Fee status in Payments Tab Fee Card
    if (appFeeStatusBadgePayments) {
        appFeeStatusBadgePayments.textContent = isAppFeePaid ? 'Paid' : 'Pending';
        // Ensure CSS classes 'fee-status', 'paid', 'pending' exist
        appFeeStatusBadgePayments.className = `fee-status ${isAppFeePaid ? 'paid' : 'pending'}`;
    }

    // Tuition/Subject Fee Status Elements
    const tuitionFeeStatusSummary = document.getElementById('tuitionFeeStatus'); // In summary grid on Status Tab
    const subjectFeeStatusBadgePayments = document.getElementById('subjectFeeStatusBadge'); // In fee card on Payments Tab

    // Determine if Tuition Fee is considered fully paid
    const isTuitionPaid = paymentStatus === 'fully_paid';

    // Update Tuition Fee status in Summary Grid
     if (tuitionFeeStatusSummary) {
        tuitionFeeStatusSummary.textContent = isTuitionPaid ? 'Paid' : 'Pending';
        tuitionFeeStatusSummary.className = isTuitionPaid ? 'status-paid' : 'status-pending';
    }
    // Update Tuition Fee status in Payments Tab Fee Card
    if (subjectFeeStatusBadgePayments) {
        subjectFeeStatusBadgePayments.textContent = isTuitionPaid ? 'Paid' : 'Pending';
        subjectFeeStatusBadgePayments.className = `fee-status ${isTuitionPaid ? 'paid' : 'pending'}`;
    }
}

/**
 * Updates the summary section on the Status tab.
 * @param {object} applicationData - The application data.
 */
function updateSummarySection(applicationData) {
    // Update subjects count
    const subjectCount = applicationData.selectedSubjects?.length || 0;
    const subjectsSummary = document.getElementById('subjectsSummary');
    if (subjectsSummary) {
        subjectsSummary.textContent = `${subjectCount} ${subjectCount === 1 ? 'subject' : 'subjects'}`;
    }

    // Update payment plan display
    const paymentPlanSummary = document.getElementById('paymentPlanSummary');
    if (paymentPlanSummary) {
        paymentPlanSummary.textContent = applicationData.paymentPlan
            ? getPlanDisplayName(applicationData.paymentPlan) // Use helper for display name
            : 'Not Selected';
    }

    // Application Fee and Tuition Fee status are updated by updateStatusBadges()
}

/**
 * Shows/hides payment plan selector, payment cards, or monthly payment list
 * based on application status and selected payment plan. Also enables/disables payment buttons.
 * @param {object} applicationData - The application data.
 */
function updatePaymentDisplay(applicationData) {
    // Get references to relevant UI sections/elements
    const paymentPlanSelectDiv = document.querySelector('.payment-plan-selection');
    const paymentCardsDiv = document.querySelector('.payment-cards'); // Container for plan options (Upfront, 6m, 10m)
    const paymentOptionsContainer = document.querySelector('.payment-options'); // Higher-level container for cards
    const monthlyPaymentsDiv = document.getElementById('monthlyPayments'); // Container for monthly breakdown
    const tuitionPaymentNoticeDiv = document.getElementById('tuitionPaymentNotice'); // Approval notice area

    // Ensure all required elements are present in the DOM
     if (!paymentPlanSelectDiv || !paymentCardsDiv || !paymentOptionsContainer || !monthlyPaymentsDiv || !tuitionPaymentNoticeDiv) {
         console.error("One or more payment UI containers are missing. Cannot update payment display.");
         return;
     }

    // Extract relevant status and plan info
    const paymentPlan = applicationData.paymentPlan; // e.g., 'upfront', 'sixMonths', 'tenMonths', or undefined/null
    const isApproved = applicationData.status === 'approved';
    const isFullyPaid = applicationData.paymentStatus === 'fully_paid';

    // 1. Display Approval Notice (always visible, content changes)
    tuitionPaymentNoticeDiv.style.display = 'block';
    if (isApproved) {
         tuitionPaymentNoticeDiv.innerHTML = `
             <div class="alert alert-success">
                 <i class="fas fa-check-circle"></i>
                 <strong>Application Approved!</strong> You can now select a payment plan and proceed with tuition fees.
             </div>
         `;
    } else {
         tuitionPaymentNoticeDiv.innerHTML = `
             <div class="alert alert-info">
                 <i class="fas fa-info-circle"></i>
                 <strong>Pending Approval:</strong> Tuition payment options will be available once approved.
             </div>
         `;
         // If not approved, hide all payment options below the notice and exit
         paymentPlanSelectDiv.style.display = 'none';
         paymentOptionsContainer.style.display = 'none'; // Hides cards container too
         monthlyPaymentsDiv.style.display = 'none';
         // Disable all buttons just in case
         document.querySelectorAll('.pay-tuition-btn, .pay-month-btn').forEach(btn => btn.disabled = true);
         return; // Nothing more to show/do if not approved
    }

    // 2. Determine Visibility Logic (only runs if approved)
    let showPlanSelector = !paymentPlan && !isFullyPaid; // Show selector only if NO plan chosen AND not fully paid yet
    let showPaymentCards = !paymentPlan && !isFullyPaid; // Show plan option cards only if NO plan chosen AND not fully paid
    let showMonthlyPayments = (paymentPlan === 'sixMonths' || paymentPlan === 'tenMonths') && !isFullyPaid; // Show monthly list if installment plan chosen AND not fully paid
    let showPaymentOptionsContainer = !isFullyPaid; // Show the whole section unless fully paid

    // Apply visibility
    paymentPlanSelectDiv.style.display = showPlanSelector ? 'block' : 'none';
    paymentOptionsContainer.style.display = showPaymentOptionsContainer ? 'block' : 'none'; // Show/hide container first
    paymentCardsDiv.style.display = showPaymentCards ? 'grid' : 'none'; // Then show/hide cards inside if needed
    monthlyPaymentsDiv.style.display = showMonthlyPayments ? 'block' : 'none';

    // 3. Generate Monthly Payments content if needed
    if (showMonthlyPayments) {
        // Check if function is available (it should be imported)
        if (typeof generateMonthlyPayments === 'function') {
            generateMonthlyPayments(applicationData, paymentPlan); // Pass data and plan
        } else {
             console.error("generateMonthlyPayments function is not available in ui.js scope.");
             monthlyPaymentsDiv.innerHTML = '<p class="error-message">Error displaying payment schedule.</p>';
        }
    }

    // 4. Update Button States (Enable/disable based on approval and payment status)
    const allPaymentButtons = document.querySelectorAll('.pay-tuition-btn, .pay-month-btn');
    allPaymentButtons.forEach(button => {
        let disableButton = !isApproved || isFullyPaid; // Disable if not approved OR already fully paid

        // Specific logic for monthly buttons: disable if already paid for that month
        if (button.classList.contains('pay-month-btn')) {
            const month = button.getAttribute('data-month');
            const isMonthPaid = checkIfMonthIsPaid(applicationData, month); // Use helper

            if (isMonthPaid) {
                 disableButton = true; // Keep it disabled if paid
                 button.textContent = '✓ Paid';
                 button.classList.remove('btn-primary'); // Ensure correct styling
                 button.classList.add('btn-success');
            } else if (!disableButton) { // If not disabled by general rules AND not paid
                 // Ensure button is correctly styled as 'Pay Now'
                 button.textContent = 'Pay Now';
                 button.classList.remove('btn-success');
                 button.classList.add('btn-primary');
            }
        }

        button.disabled = disableButton;
        button.title = disableButton ? (isFullyPaid ? 'All fees paid' : 'Application must be approved') : '';
    });
}


// --- Helper Functions used by UI Updates (keep them local or move to utilities if used elsewhere) ---

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
    };
    // Provide a default formatting for unknown statuses
    return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Gets a descriptive text for a status code.
 * @param {string} status - The status code.
 * @returns {string} - The description.
 */
 function getStatusDescription(status) {
    const descriptionMap = {
        'submitted': 'Your application has been submitted and is awaiting review.',
        'under-review': 'Your application is currently being reviewed by our team.',
        'approved': 'Your application has been approved! You can now proceed with tuition payments.',
        'rejected': 'Your application has been rejected. Please contact support for more information.'
    };
    return descriptionMap[status] || 'Status update pending.';
}

/**
 * Gets a display-friendly name for a payment plan code.
 * @param {string} paymentPlan - The plan code (e.g., 'upfront', 'sixMonths').
 * @returns {string} - The display name.
 */
 function getPlanDisplayName(paymentPlan) {
    const planNames = {
        'upfront': 'Upfront Payment',
        'sixMonths': '6 Months Installment',
        'tenMonths': '10 Months Installment'
    };
    return planNames[paymentPlan] || paymentPlan; // Return code itself if not found
}

/**
 * Formats a date object or Firestore Timestamp.
 * @param {Date|object} date - The date/timestamp to format.
 * @param {string} [locale='en-ZA'] - Locale string.
 * @returns {string} - Formatted date string or '-'.
 */
 function formatDate(date, locale = 'en-ZA') {
    if (!date) return '-';
    try {
        // Handle both JS Date objects and Firestore Timestamps
        const d = date.toDate ? date.toDate() : new Date(date);
        // Check if date is valid after conversion
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        console.warn("Error formatting date:", date, e);
        return '-';
    }
}

/**
 * Checks if a specific month's payment is marked as paid in the application data.
 * Handles nested payment structure.
 * @param {object} applicationData - The application data.
 * @param {string} monthName - The full month name (e.g., "October 2025").
 * @returns {boolean} - True if the month is marked as paid, false otherwise.
 */
function checkIfMonthIsPaid(applicationData, monthName) {
    if (!monthName || !applicationData) return false;
    // Create the key used in Firestore (e.g., "october_2025")
    const monthKey = monthName.toLowerCase().replace(/ /g, '_');

    // Check the nested 'payments' object first
    if (applicationData.payments && applicationData.payments[monthKey]) {
        return applicationData.payments[monthKey].paid === true;
    }

    // Fallback check for potentially flattened structure (less likely now)
    // const paymentKey = `payments.${monthKey}.paid`;
    // if (applicationData[paymentKey] === true) {
    //     return true;
    // }

    return false; // Not found or not paid
}


// --- General UI Utilities (Keep existing ones) ---

// (Keep your existing functions like showLoading, toggleElement, setElementText, etc. below this line)
// ...

// Enhanced UI utility functions
export function showLoading(show = true) {
  const spinner = document.querySelector('.loading-spinner');
  if (spinner) {
    spinner.style.display = show ? 'flex' : 'none';
    spinner.setAttribute('aria-busy', show.toString());
  }
}

export function toggleElement(element, show) {
  if (element) {
    element.style.display = show ? 'block' : 'none';
  }
}

export function setElementText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

export function addClass(element, className) {
  if (element) {
    element.classList.add(className);
  }
}

export function removeClass(element, className) {
  if (element) {
    element.classList.remove(className);
  }
}

export function toggleClass(element, className, force) {
  if (element) {
    element.classList.toggle(className, force);
  }
}

export function disableElement(element, disabled = true) {
  if (element) {
    element.disabled = disabled;
    if (disabled) {
      element.setAttribute('aria-disabled', 'true');
    } else {
      element.removeAttribute('aria-disabled');
    }
  }
}

export function enableElement(element) {
  disableElement(element, false);
}

export function setElementVisibility(element, visible) {
  if (element) {
    element.style.visibility = visible ? 'visible' : 'hidden';
  }
}

export function fadeIn(element, duration = 300) {
  if (element) {
    element.style.opacity = '0';
    element.style.display = 'block'; // Or 'flex', 'grid' etc. depending on element

    let start = null;
    function step(timestamp) {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const opacity = Math.min(progress / duration, 1);
      element.style.opacity = opacity.toString();

      if (progress < duration) {
        window.requestAnimationFrame(step);
      }
    }

    window.requestAnimationFrame(step);
  }
}

export function fadeOut(element, duration = 300) {
  if (element) {
    let start = null;
    function step(timestamp) {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const opacity = Math.max(1 - progress / duration, 0);
      element.style.opacity = opacity.toString();

      if (progress < duration) {
        window.requestAnimationFrame(step);
      } else {
        element.style.display = 'none';
        element.style.opacity = '1'; // Reset opacity for next time
      }
    }

    window.requestAnimationFrame(step);
  }
}

export function scrollToElement(element, behavior = 'smooth') {
  if (element) {
    element.scrollIntoView({
      behavior: behavior,
      block: 'start' // Aligns top of element to top of viewport
    });
  }
}

export function scrollToTop(behavior = 'smooth') {
  window.scrollTo({
    top: 0,
    behavior: behavior
  });
}

export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex'; // Use flex for centering
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
  }
}

// Sets up close handlers for a modal
export function setupModalClose(modalId, closeSelectors = ['.close', '.cancel-btn', '#cancelPaystackPayment', '#cancelSubjectPayment', '#cancelPlanSelection']) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const closeModal = () => hideModal(modalId);

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close on specific button/element clicks
  closeSelectors.forEach(selector => {
    const closeElements = modal.querySelectorAll(selector);
    closeElements.forEach(element => {
      // Ensure listener isn't added multiple times if function is called repeatedly
      element.removeEventListener('click', closeModal); // Remove existing first
      element.addEventListener('click', closeModal);
    });
  });

  // Close on Escape key - Attach listener to document, remove on close
   const handleEscape = (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
      document.removeEventListener('keydown', handleEscape); // Clean up listener
    }
  };
   // Add listener only when modal is shown? Or manage globally? For simplicity:
   document.addEventListener('keydown', handleEscape);
   // Consider removing this listener when the modal is explicitly hidden too.
}


export function updateButtonState(button, isLoading, loadingText = 'Loading...') {
  if (button) {
    if (isLoading) {
      button.disabled = true;
      // Store original content if not already stored
      if (!button.hasAttribute('data-original-content')) {
           button.setAttribute('data-original-content', button.innerHTML);
      }
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
    } else {
      button.disabled = false;
      // Restore original content
      const originalContent = button.getAttribute('data-original-content');
      if (originalContent) {
        button.innerHTML = originalContent;
        button.removeAttribute('data-original-content');
      }
      // Fallback if attribute wasn't set (shouldn't happen with the check above)
      // else { button.innerHTML = 'Submit'; }
    }
  }
}

// Notification functions (keep as is or adapt if needed)
export function createNotification(message, type = 'info', duration = 5000) {
    // ... (implementation as previously defined) ...
     const notification = document.createElement('div');
     notification.className = `notification ${type}`; // Ensure CSS exists for .notification and types
     notification.setAttribute('role', 'alert');
     notification.innerHTML = `
        <div class="notification-content">
          <i class="fas fa-${getNotificationIcon(type)} notification-icon"></i>
          <span class="notification-message">${message}</span>
          <button class="notification-close" aria-label="Close notification">
            <i class="fas fa-times"></i>
          </button>
        </div>
     `;

    const container = document.getElementById('notificationContainer') || createNotificationContainer();
    container.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Close button handler
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => removeNotification(notification));

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
        // Check if notification still exists before trying to remove
            if (notification.parentNode === container) {
                removeNotification(notification);
            }
        }, duration);
    }

    return notification; // Return the element if needed
}

function getNotificationIcon(type) {
  const icons = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };
  return icons[type] || 'info-circle'; // Default to info icon
}

function createNotificationContainer() {
  let container = document.getElementById('notificationContainer');
  if (!container) {
      container = document.createElement('div');
      container.id = 'notificationContainer';
      container.className = 'notification-container'; // Ensure CSS exists for this
      document.body.appendChild(container);
  }
  return container;
}

function removeNotification(notification) {
  notification.classList.remove('show');
  // Wait for fade-out transition before removing from DOM
  notification.addEventListener('transitionend', () => {
       if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
       }
  }, { once: true }); // Ensure listener runs only once

   // Fallback removal if transition doesn't fire (e.g., display: none)
   setTimeout(() => {
        if (notification.parentNode) {
             notification.parentNode.removeChild(notification);
        }
   }, 500); // Should match transition duration
}


// Formatting functions (keep as is)
export function formatCurrency(amount, currency = 'ZAR', locale = 'en-ZA') {
    // ... (implementation as previously defined) ...
     // Ensure amount is a number
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) {
         return 'Invalid Amount';
    }
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
    }).format(numericAmount);
}

// Note: formatDate was moved inside ui.js as a local helper, keep it there or make it global if needed elsewhere
// export function formatDate(date, locale = 'en-ZA') { ... }

export function formatDateTime(date, locale = 'en-ZA') {
    // ... (implementation as previously defined) ...
     if (!date) return '';
     try {
         const dateObj = date.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date));
         if (isNaN(dateObj.getTime())) return 'Invalid Date';
         return new Intl.DateTimeFormat(locale, {
             year: 'numeric',
             month: 'short',
             day: 'numeric',
             hour: '2-digit',
             minute: '2-digit',
             hour12: false // Use 24-hour format often preferred locally
         }).format(dateObj);
     } catch (error) {
         console.warn("Error formatting date/time:", date, error);
         return '';
     }
}

export function truncateText(text, maxLength, ellipsis = '...') {
    // ... (implementation as previously defined) ...
     if (typeof text !== 'string' || text.length <= maxLength) return text;
     return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

export function capitalizeWords(str) {
    // ... (implementation as previously defined) ...
     if (typeof str !== 'string' || !str) return '';
     return str.replace(/\b\w/g, char => char.toUpperCase()); // Simpler regex
}

export function sanitizeForId(str) {
    // ... (implementation as previously defined) ...
    if (typeof str !== 'string' || !str) return '';
    return str
        .toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/[^a-z0-9-]/g, '') // Remove invalid chars
        .replace(/-+/g, '-') // Collapse multiple hyphens
        .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}