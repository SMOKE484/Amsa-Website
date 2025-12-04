// Admin Dashboard JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Constants
    const STATUS = {
        SUBMITTED: 'submitted',
        UNDER_REVIEW: 'under-review',
        APPROVED: 'approved',
        REJECTED: 'rejected'
    };

    const PAYMENT_STATUS = {
        PENDING: 'pending',
        APPLICATION_PAID: 'application_paid',
        FULLY_PAID: 'fully_paid'
    };

    const FEE_STRUCTURE = {
        1: { upfront: 1100, sixMonths: 1300, tenMonths: 1500 },
        2: { upfront: 2100, sixMonths: 2300, tenMonths: 2500 },
        3: { upfront: 3100, sixMonths: 3300, tenMonths: 3500 },
        4: { upfront: 4100, sixMonths: 4300, tenMonths: 4500 }
    };

    const APPLICATIONS_PER_PAGE = 10;
    const CACHE_TTL = 3600000; // 1 hour in ms

    // DOM Elements
    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminAvatar = document.getElementById('adminAvatar');
    const adminName = document.getElementById('adminName');
    const menuItems = document.querySelectorAll('.menu-item');
    const contentSections = document.querySelectorAll('.content-section');
    const backToListBtn = document.getElementById('backToListBtn');
    const applicationsTableBody = document.getElementById('applicationsTableBody');
    const paymentsTableBody = document.getElementById('paymentsTableBody');
    const statusFilter = document.getElementById('statusFilter');
    const gradeFilter = document.getElementById('gradeFilter');
    const paymentFilter = document.getElementById('paymentFilter');
    const paymentStatusFilter = document.getElementById('paymentStatusFilter');
    const paymentPlanFilter = document.getElementById('paymentPlanFilter');
    const searchInput = document.getElementById('searchInput');
    const paymentSearchInput = document.getElementById('paymentSearchInput');
    const saveStatusBtn = document.getElementById('saveStatusBtn');
    const statusChangeSelect = document.getElementById('statusChangeSelect');
    const downloadApplicationBtn = document.getElementById('downloadApplicationBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    
    // Modal Elements
    const paymentDetailModal = document.getElementById('paymentDetailModal');
    const closePaymentModal = document.getElementById('closePaymentModal');
    const modalCloseBtn = paymentDetailModal?.querySelector('.close');
    
    // State
    let applications = [];
    let currentApplication = null;
    
    // Pagination
    let currentPage = 1;
    let filteredApplications = [];
    
    // Sorting
    let sortColumn = null;
    let sortDirection = 'asc';

    // Listener for the specific application detail view
    let currentApplicationListener = null; // To store the unsubscribe function

    // Check if Firebase is properly initialized
    function checkFirebaseAvailability() {
        if (!window.firebase) {
            console.error("Firebase is not properly initialized");
            return false;
        }
        
        // Check if required Firebase functions are available
        const requiredFunctions = [
            'auth', 'db', 'signInWithPopup', 'GoogleAuthProvider', 'signOut', 
            'onAuthStateChanged', 'collection', 'getDocs', 'getDoc', 'doc', 
            'updateDoc', 'query', 'where', 'orderBy', 'serverTimestamp', 'arrayUnion',
            'onSnapshot'
        ];
        
        const missingFunctions = requiredFunctions.filter(func => !window.firebase[func]);
        if (missingFunctions.length > 0) {
            console.error("Missing Firebase functions:", missingFunctions);
            return false;
        }
        
        return true;
    }

    // Event Listeners
    googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    logoutBtn.addEventListener('click', handleLogout);
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            showSection(section);
        });
    });
    
    backToListBtn.addEventListener('click', () => {
        cleanupDetailListener(); // Clean up listener on close
        showSection('applications');
    });
    
    statusFilter.addEventListener('change', filterApplications);
    gradeFilter.addEventListener('change', filterApplications);
    paymentFilter.addEventListener('change', filterApplications);
    paymentStatusFilter.addEventListener('change', renderPayments);
    paymentPlanFilter.addEventListener('change', renderPayments);
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(filterApplications, 300);
    });
    paymentSearchInput.addEventListener('input', () => {
        clearTimeout(paymentSearchTimeout);
        paymentSearchTimeout = setTimeout(renderPayments, 300);
    });
    saveStatusBtn.addEventListener('click', updateApplicationStatus);
    downloadApplicationBtn.addEventListener('click', downloadApplicationPDF);
    prevPageBtn.addEventListener('click', goToPrevPage);
    nextPageBtn.addEventListener('click', goToNextPage);
    
    // Modal event listeners
    if (closePaymentModal) {
        closePaymentModal.addEventListener('click', () => {
            paymentDetailModal.style.display = 'none';
        });
    }
    
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            paymentDetailModal.style.display = 'none';
        });
    }
    
    if (paymentDetailModal) {
        paymentDetailModal.addEventListener('click', (e) => {
            if (e.target === paymentDetailModal) {
                paymentDetailModal.style.display = 'none';
            }
        });
    }
    
    // Debounce for search
    let searchTimeout;
    let paymentSearchTimeout;

    // *** ADDED: Event delegation for collapsible sections ***
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('click', (e) => {
            // Find the closest .collapsible-header
            const header = e.target.closest('.collapsible-header');
            
            if (header) {
                e.preventDefault(); // Prevent any default action
                
                // Get the target content ID
                const targetId = header.dataset.target;
                if (!targetId) {
                    console.warn('Collapsible header missing data-target attribute');
                    return;
                }
                
                // Find the content element
                const content = document.getElementById(targetId);
                if (!content) {
                    console.error(`Collapsible content with ID ${targetId} not found`);
                    return;
                }
                
                // Toggle the 'collapsed' class on the header
                header.classList.toggle('collapsed');
                
                // The CSS will handle the show/hide
            }
        });
    }

    // Initialize
    checkAuthState();
    
    // Helper function to clean up the detail view listener
    function cleanupDetailListener() {
        if (currentApplicationListener) {
            console.log('Cleaning up detail view listener');
            currentApplicationListener(); // This unsubscribes
            currentApplicationListener = null;
        }
    }

    // *** ADDED: Helper function to extract payments from Firestore data ***
    function extractPayments(firestoreData) {
        const payments = {};
        
        // Look for payments in nested structure (payments.october_2025, etc.)
        Object.keys(firestoreData).forEach(key => {
            if (key.startsWith('payments.')) {
                const monthKey = key.replace('payments.', '');
                payments[monthKey] = firestoreData[key];
            }
        });
        
        // Also check if there's a direct payments object
        if (firestoreData.payments && typeof firestoreData.payments === 'object') {
            Object.assign(payments, firestoreData.payments);
        }
        
        console.log("Extracted payments:", payments);
        return Object.keys(payments).length > 0 ? payments : undefined;
    }

    // Functions
    async function checkAuthState() {
        if (!checkFirebaseAvailability()) {
            console.error("Firebase is not properly initialized");
            showToast("Admin portal is not properly configured. Please contact support.", "error");
            return;
        }

        const { onAuthStateChanged, doc, getDoc } = window.firebase;

        onAuthStateChanged(window.firebase.auth, async (user) => {
            if (user) {
                try {
                    // Check if user is admin
                    const adminDoc = await getDoc(doc(window.firebase.db, "admins", user.uid));
                    if (adminDoc.exists() && adminDoc.data().role === "admin") {
                        loginSection.style.display = 'none';
                        dashboardSection.style.display = 'block';
                        adminAvatar.textContent = user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase();
                        adminName.textContent = user.displayName || user.email;
                        
                        // Load applications (without real-time for now)
                        await loadApplicationsFallback();
                        
                        // Try to set up real-time listeners if available
                        setupRealTimeListeners();
                        
                    } else {
                        alert("You don't have permission to access the admin portal.");
                        handleLogout();
                    }
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    if (error.code === 'permission-denied') {
                        alert("Permission denied. Please check Firebase security rules.");
                    } else {
                        alert("Authentication error: " + error.message);
                    }
                    handleLogout();
                }
            } else {
                loginSection.style.display = 'flex';
                dashboardSection.style.display = 'none';
            }
        });
    }
    
    function handleGoogleSignIn() {
        if (!checkFirebaseAvailability()) return;

        const { signInWithPopup, GoogleAuthProvider } = window.firebase;
        const provider = new GoogleAuthProvider();
        
        // Add scopes if needed
        provider.addScope('email');
        provider.addScope('profile');
        
        signInWithPopup(window.firebase.auth, provider)
            .catch(error => {
                console.error("Google Sign-In Error:", error);
                if (error.code === 'auth/cancelled-popup-request') {
                    // Ignore cancelled popup requests
                    console.log("Sign-in popup was cancelled");
                } else {
                    alert("Sign in failed: " + error.message);
                }
            });
    }
    
    function handleLogout() {
        if (confirm("Are you sure you want to log out?")) {
            if (!checkFirebaseAvailability()) return;
            const { signOut } = window.firebase;
            signOut(window.firebase.auth);
        }
    }
    
    function showSection(sectionId) {
        console.log(`Attempting to show section: ${sectionId}`);
        
        // If we are navigating *away* from the detail section, clean up the listener
        if (sectionId !== 'applicationDetail') {
            cleanupDetailListener();
        }

        menuItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
        });
        
        let targetSection = null;
        contentSections.forEach(section => {
            if (section.id === `${sectionId}Section`) {
                section.classList.add('active');
                targetSection = section;
            } else {
                section.classList.remove('active');
            }
        });

        if (!targetSection) {
            console.error(`Section with ID ${sectionId}Section not found`);
            alert('Error: Could not display the requested section. Please contact support.');
            return;
        }

        if (sectionId === 'analytics') {
            loadAnalytics();
        } else if (sectionId === 'payments') {
            renderPayments();
        }
    }
    
    // Setup real-time listeners if available
    function setupRealTimeListeners() {
        // Check if onSnapshot is available
        if (typeof window.firebase.onSnapshot === 'function') {
            try {
                setupApplicationsListener();
                console.log("Real-time listeners initialized");
            } catch (error) {
                console.warn("Real-time listeners not available:", error);
                showToast("Real-time updates not available. Manual refresh required.", "warning");
            }
        } else {
            console.warn("onSnapshot not available. Using manual refresh only.");
            showToast("Real-time updates not available. Manual refresh required.", "warning");
        }
    }
    
    // Real-time applications listener (for the main list)
    function setupApplicationsListener() {
        if (!checkFirebaseAvailability() || !window.firebase.onSnapshot) return;

        const { collection, query, orderBy, onSnapshot } = window.firebase;
        
        try {
            const q = query(collection(window.firebase.db, "applications"), orderBy("submittedAt", "desc"));
            
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                console.log('Real-time update received for applications collection');
                
                applications = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        submittedAt: data.submittedAt ? data.submittedAt.toDate() : new Date(),
                        statusUpdates: data.statusUpdates ? data.statusUpdates.map(update => ({
                            ...update,
                            timestamp: update.timestamp ? update.timestamp.toDate() : new Date()
                        })) : []
                    };
                });
                
                // Update cache with fresh data
                localStorage.setItem('cachedApplications', JSON.stringify({
                    data: applications.map(app => ({
                        ...app,
                        submittedAt: app.submittedAt.toISOString(),
                        statusUpdates: app.statusUpdates ? app.statusUpdates.map(update => ({
                            ...update,
                            timestamp: update.timestamp.toISOString()
                        })) : []
                    })),
                    timestamp: Date.now()
                }));
                
                filteredApplications = [...applications];
                updateStats();
                renderApplications();
                updatePagination();
                renderPayments();
                
                // Note: We don't refresh the detail view here.
                // The dedicated detail listener (currentApplicationListener) will handle that.
                
                // Check for payment updates to show toast
                querySnapshot.docChanges().forEach((change) => {
                    if (change.type === 'modified') {
                         const updatedApp = change.doc.data();
                         // Simple check: if paymentStatus changed and isn't pending, it's a payment update.
                         if (change.doc.data().paymentStatus !== PAYMENT_STATUS.PENDING) {
                            console.log('Payment update detected for:', updatedApp.firstName, updatedApp.lastName);
                            showToast(`Payment update: ${updatedApp.firstName} ${updatedApp.lastName}`, 'success');
                         }
                    }
                });

            }, (error) => {
                console.error("Real-time listener error:", error);
                showToast('Error receiving updates', 'error');
            });
            
            // Store unsubscribe function for cleanup
            window.applicationUnsubscribe = unsubscribe;
            
        } catch (error) {
            console.error("Error setting up applications listener:", error);
            throw error;
        }
    }

    // Fallback function for loading applications
    async function loadApplicationsFallback() {
        if (!checkFirebaseAvailability()) return;
        
        try {
            showLoading(true);
            const { collection, getDocs, query, orderBy } = window.firebase;
            const q = query(collection(window.firebase.db, "applications"), orderBy("submittedAt", "desc"));
            const querySnapshot = await getDocs(q);
            
            applications = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    submittedAt: data.submittedAt ? data.submittedAt.toDate() : new Date(),
                    statusUpdates: data.statusUpdates ? data.statusUpdates.map(update => ({
                        ...update,
                        timestamp: update.timestamp ? update.timestamp.toDate() : new Date()
                    })) : []
                };
            });
            
            localStorage.setItem('cachedApplications', JSON.stringify({
                data: applications.map(app => ({
                    ...app,
                    submittedAt: app.submittedAt.toISOString(),
                    statusUpdates: app.statusUpdates ? app.statusUpdates.map(update => ({
                        ...update,
                        timestamp: update.timestamp.toISOString()
                    })) : []
                })),
                timestamp: Date.now()
            }));
            
            filteredApplications = [...applications];
            updateStats();
            renderApplications();
            updatePagination();
            
            showToast('Applications loaded successfully', 'success');
            
        } catch (error) {
            console.error("Error loading applications:", error);
            if (error.code === 'permission-denied') {
                showToast("Permission denied. Please check Firebase security rules.", "error");
            } else {
                showToast("Failed to load applications: " + error.message, "error");
            }
            
            // Try to load from cache as last resort
            loadFromCache();
        } finally {
            showLoading(false);
        }
    }
    
    // Load from cache as fallback
    function loadFromCache() {
        const cached = localStorage.getItem('cachedApplications');
        if (cached) {
            try {
                const parsedCache = JSON.parse(cached);
                if (Date.now() - parsedCache.timestamp < CACHE_TTL) {
                    applications = parsedCache.data.map(app => ({
                        ...app,
                        submittedAt: new Date(app.submittedAt),
                        statusUpdates: app.statusUpdates ? app.statusUpdates.map(update => ({
                            ...update,
                            timestamp: new Date(update.timestamp)
                        })) : []
                    }));
                    filteredApplications = [...applications];
                    updateStats();
                    renderApplications();
                    updatePagination();
                    showToast('Loaded from cache', 'warning');
                    return;
                }
            } catch (error) {
                console.error("Error loading from cache:", error);
            }
        }
        
        // No data available
        applications = [];
        filteredApplications = [];
        updateStats();
        renderApplications();
        updatePagination();
        showToast('No application data available', 'error');
    }
    
    function updateStats() {
        document.getElementById('totalApplications').textContent = applications.length || 'No applications yet';
        document.getElementById('pendingApplications').textContent = applications.filter(app => 
            app.status === STATUS.SUBMITTED || !app.status).length || 0;
        document.getElementById('approvedApplications').textContent = applications.filter(app => 
            app.status === STATUS.APPROVED).length || 0;
        document.getElementById('paidApplications').textContent = applications.filter(app => 
            app.paymentStatus === PAYMENT_STATUS.FULLY_PAID).length || 0;
        
        const recentApps = applications.slice(0, 5);
        const recentList = document.getElementById('recentApplicationsList');
        recentList.innerHTML = '';
        
        if (recentApps.length === 0) {
            const p = document.createElement('p');
            p.className = 'no-data';
            p.textContent = 'No applications found';
            recentList.appendChild(p);
            return;
        }
        
        recentApps.forEach(app => {
            const appElement = document.createElement('div');
            appElement.className = 'application-item';
            
            const appInfo = document.createElement('div');
            appInfo.className = 'app-info';
            const h4 = document.createElement('h4');
            h4.textContent = `${app.firstName} ${app.lastName}`;
            const p = document.createElement('p');
            p.textContent = `Grade ${app.grade} - ${app.school}`;
            appInfo.appendChild(h4);
            appInfo.appendChild(p);
            
            const appStatus = document.createElement('div');
            appStatus.className = 'app-status';
            const span = document.createElement('span');
            span.className = `status-badge status-${app.status || STATUS.SUBMITTED}`;
            span.textContent = app.status || STATUS.SUBMITTED;
            appStatus.appendChild(span);
            
            appElement.appendChild(appInfo);
            appElement.appendChild(appStatus);
            recentList.appendChild(appElement);
        });
    }
    
    function renderApplications() {
        const startIndex = (currentPage - 1) * APPLICATIONS_PER_PAGE;
        const endIndex = Math.min(startIndex + APPLICATIONS_PER_PAGE, filteredApplications.length);
        const pageApplications = filteredApplications.slice(startIndex, endIndex);
        
        applicationsTableBody.innerHTML = '';
        
        if (pageApplications.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 8;
            td.className = 'no-data';
            td.textContent = 'No applications found. Try resetting the filters.';
            tr.appendChild(td);
            applicationsTableBody.appendChild(tr);
            return;
        }
        
        pageApplications.forEach(app => {
            const row = document.createElement('tr');
            
            const tdName = document.createElement('td');
            tdName.textContent = `${app.firstName} ${app.lastName}`;
            row.appendChild(tdName);
            
            const tdGrade = document.createElement('td');
            tdGrade.textContent = `Grade ${app.grade}`;
            row.appendChild(tdGrade);
            
            const tdSchool = document.createElement('td');
            tdSchool.textContent = app.school;
            row.appendChild(tdSchool);
            
            const tdSubjects = document.createElement('td');
            tdSubjects.textContent = app.selectedSubjects ? app.selectedSubjects.slice(0, 2).join(', ') + (app.selectedSubjects.length > 2 ? '...' : '') : 'N/A';
            row.appendChild(tdSubjects);
            
            const tdStatus = document.createElement('td');
            const spanStatus = document.createElement('span');
            spanStatus.className = `status-badge status-${app.status || STATUS.SUBMITTED}`;
            spanStatus.textContent = app.status || STATUS.SUBMITTED;
            tdStatus.appendChild(spanStatus);
            row.appendChild(tdStatus);
            
            const tdPaymentStatus = document.createElement('td');
            const spanPaymentStatus = document.createElement('span');
            spanPaymentStatus.className = `status-badge payment-status-${app.paymentStatus || PAYMENT_STATUS.PENDING}`;
            spanPaymentStatus.textContent = app.paymentStatus || PAYMENT_STATUS.PENDING;
            tdPaymentStatus.appendChild(spanPaymentStatus);
            row.appendChild(tdPaymentStatus);
            
            const tdSubmitted = document.createElement('td');
            tdSubmitted.textContent = formatDate(app.submittedAt);
            row.appendChild(tdSubmitted);
            
            const tdActions = document.createElement('td');
            const button = document.createElement('button');
            button.className = 'btn btn-outline view-app-btn';
            button.dataset.id = app.id;
            const i = document.createElement('i');
            i.className = 'fas fa-eye';
            button.appendChild(i);
            button.appendChild(document.createTextNode(' View'));
            tdActions.appendChild(button);
            row.appendChild(tdActions);
            
            applicationsTableBody.appendChild(row);
        });
        
        document.querySelectorAll('.view-app-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const appId = btn.getAttribute('data-id');
                console.log(`View button clicked for application ID: ${appId}`);
                viewApplication(appId);
            });
        });
    }

    // *** FIXED: Properly handle payments data in real-time listener ***
    function viewApplication(appId) {
        console.log(`Setting up real-time listener for application ID: ${appId}`);

        cleanupDetailListener();

        const { doc, onSnapshot } = window.firebase;
        const appRef = doc(window.firebase.db, "applications", appId);

        currentApplicationListener = onSnapshot(appRef, (docSnap) => {
            if (docSnap.exists()) {
                console.log('Application detail view received real-time update');
                const freshData = docSnap.data();
                console.log("Raw Firestore Data:", freshData);

                // *** FIXED: Properly extract payments from Firestore nested structure ***
                currentApplication = {
                    id: docSnap.id,
                    firstName: freshData.firstName,
                    lastName: freshData.lastName,
                    email: freshData.email,
                    phone: freshData.phone,
                    grade: freshData.grade,
                    school: freshData.school,
                    gender: freshData.gender,
                    selectedSubjects: freshData.selectedSubjects,
                    parentName: freshData.parentName,
                    parentRelationship: freshData.parentRelationship,
                    parentPhone: freshData.parentPhone,
                    parentEmail: freshData.parentEmail,
                    reportCardUrl: freshData.reportCardUrl,
                    idDocumentUrl: freshData.idDocumentUrl,
                    status: freshData.status,
                    paymentStatus: freshData.paymentStatus,
                    paymentPlan: freshData.paymentPlan,
                    paymentStartDate: freshData.paymentStartDate,
                    // *** CRITICAL FIX: Use helper function to extract payments ***
                    payments: extractPayments(freshData),
                    submittedAt: freshData.submittedAt ? freshData.submittedAt.toDate() : new Date(),
                    statusUpdates: freshData.statusUpdates ? freshData.statusUpdates.map(update => ({
                        ...update,
                        timestamp: update.timestamp ? update.timestamp.toDate() : new Date()
                    })) : [],
                    alternateContact: freshData.alternateContact,
                    finalAgreement: freshData.finalAgreement,
                    lastStatusUpdateTimestamp: freshData.lastStatusUpdateTimestamp,
                    learnerFullName: freshData.learnerFullName,
                    learnerFullNamePledge: freshData.learnerFullNamePledge,
                    learnerId: freshData.learnerId,
                    learnerSignature: freshData.learnerSignature,
                    learnerSignatureDate: freshData.learnerSignatureDate,
                    parentConsent: freshData.parentConsent,
                    parentConsentDate: freshData.parentConsentDate,
                    parentFullName: freshData.parentFullName,
                    parentFullNamePledge: freshData.parentFullNamePledge,
                    parentSignature: freshData.parentSignature,
                    parentSignatureDatePledge: freshData.parentSignatureDatePledge,
                    parentSignaturePledge: freshData.parentSignaturePledge,
                    rulesAgreement: freshData.rulesAgreement,
                    selectedPrograms: freshData.selectedPrograms,
                    timestamp: freshData.timestamp,
                    updatedAt: freshData.updatedAt
                };

                console.log("Processed currentApplication object:", currentApplication);
                console.log("Payments after processing:", currentApplication.payments);

                // Update local applications array
                const appIndex = applications.findIndex(app => app.id === appId);
                if (appIndex !== -1) {
                     applications[appIndex] = { ...currentApplication };
                }

                // Render the details
                renderApplicationDetails();

                // Show the section
                showSection('applicationDetail');

            } else {
                console.error(`Application with ID ${appId} not found`);
                showToast('Application not found', 'error');
                cleanupDetailListener();
                showSection('applications');
            }
        }, (error) => {
            console.error("Error listening to application detail:", error);
            showToast('Error loading application details', 'error');
            cleanupDetailListener();
        });
    }

    function renderApplicationDetails() {
        console.log("Entering renderApplicationDetails, currentApplication.payments is:", currentApplication ? currentApplication.payments : 'currentApplication is null/undefined');

        if (!currentApplication) {
            console.error("renderApplicationDetails called but currentApplication is null");
            return;
        }

        const requiredIds = [
            'detailName', 'detailEmail', 'detailPhone', 'detailGrade', 'detailSchool', 'detailGender',
            'detailSubjects', 'detailParentName', 'detailParentRelationship', 'detailParentPhone',
            'detailParentEmail', 'reportCardLink', 'idDocumentLink', 'statusChangeSelect', 'statusHistory',
            'detailPaymentStatus', 'detailPaymentPlan', 'detailTotalAmount', 'detailAmountPaid', 'detailBalance',
            'paymentHistory', 'paymentTotalDue', 'paymentTotalPaid', 'paymentRemainingBalance',
            'monthlyPaymentScheduleCard', 'monthlyPaymentGrid'
        ];
        
        for (const id of requiredIds) {
            if (!document.getElementById(id)) {
                console.error(`DOM element with ID ${id} not found`);
                alert('Application details view is misconfigured. Please contact support.');
                return;
            }
        }

        console.log('Rendering details for:', currentApplication.id);

        document.getElementById('detailName').textContent = `${currentApplication.firstName || ''} ${currentApplication.lastName || ''}` || 'Not provided';
        document.getElementById('detailEmail').textContent = currentApplication.email || 'N/A';
        document.getElementById('detailPhone').textContent = currentApplication.phone || 'N/A';
        document.getElementById('detailGrade').textContent = currentApplication.grade ? `Grade ${currentApplication.grade}` : 'N/A';
        document.getElementById('detailSchool').textContent = currentApplication.school || 'N/A';
        document.getElementById('detailGender').textContent = currentApplication.gender || 'N/A';

        const subjectCount = currentApplication.selectedSubjects ? currentApplication.selectedSubjects.length : 0;
        const paymentPlan = currentApplication.paymentPlan || 'upfront';
        const totalAmount = calculateTotalAmount(subjectCount, paymentPlan);
        const amountPaid = calculateAmountPaid(currentApplication, totalAmount);
        const balance = totalAmount - amountPaid;

        document.getElementById('detailPaymentStatus').textContent = currentApplication.paymentStatus || PAYMENT_STATUS.PENDING;
        document.getElementById('detailPaymentPlan').textContent = formatPaymentPlan(paymentPlan);
        document.getElementById('detailTotalAmount').textContent = `R${totalAmount.toFixed(2)}`;
        document.getElementById('detailAmountPaid').textContent = `R${amountPaid.toFixed(2)}`;
        document.getElementById('detailBalance').textContent = `R${balance.toFixed(2)}`;
        document.getElementById('detailBalance').style.color = balance > 0 ? 'var(--danger)' : 'var(--success)';

        const subjectsContainer = document.getElementById('detailSubjects');
        subjectsContainer.innerHTML = '';
        if (currentApplication.selectedSubjects && currentApplication.selectedSubjects.length > 0) {
            currentApplication.selectedSubjects.forEach(subject => {
                const subjectTag = document.createElement('span');
                subjectTag.className = 'subject-tag';
                subjectTag.textContent = subject || 'N/A';
                subjectsContainer.appendChild(subjectTag);
            });
        } else {
            const p = document.createElement('p');
            p.textContent = 'No subjects selected';
            subjectsContainer.appendChild(p);
        }

        document.getElementById('detailParentName').textContent = currentApplication.parentName || 'N/A';
        document.getElementById('detailParentRelationship').textContent = currentApplication.parentRelationship || 'N/A';
        document.getElementById('detailParentPhone').textContent = currentApplication.parentPhone || 'N/A';
        document.getElementById('detailParentEmail').textContent = currentApplication.parentEmail || 'N/A';

        const reportCardLink = document.getElementById('reportCardLink');
        const idDocumentLink = document.getElementById('idDocumentLink');
        if (currentApplication.reportCardUrl) {
            reportCardLink.href = currentApplication.reportCardUrl;
            reportCardLink.style.display = 'inline';
        } else {
            reportCardLink.style.display = 'none';
        }
        if (currentApplication.idDocumentUrl) {
            idDocumentLink.href = currentApplication.idDocumentUrl;
            idDocumentLink.style.display = 'inline';
        } else {
            idDocumentLink.style.display = 'none';
        }

        document.getElementById('statusChangeSelect').value = currentApplication.status || STATUS.SUBMITTED;

        renderEnhancedPaymentHistory(currentApplication, totalAmount, amountPaid, balance);
        renderMonthlyPaymentSchedule(currentApplication, paymentPlan, subjectCount);

        const statusHistory = document.getElementById('statusHistory');
        statusHistory.innerHTML = '';
        if (currentApplication.submittedAt) {
             const statusItem = createStatusItem('Application submitted', formatDate(currentApplication.submittedAt), 'fa-check-circle', 'var(--success)');
             statusHistory.appendChild(statusItem);
         }
        if (currentApplication.statusUpdates) {
             currentApplication.statusUpdates.forEach(update => {
                 let icon = 'fa-check-circle';
                 let color = 'var(--success)';
                 if (update.status === STATUS.REJECTED) {
                     icon = 'fa-times-circle'; color = 'var(--danger)';
                 } else if (update.status === STATUS.UNDER_REVIEW) {
                     icon = 'fa-clock'; color = 'var(--warning)';
                 }
                 const statusItem = createStatusItem(`Status changed to ${update.status}`, formatDate(update.timestamp), icon, color);
                 statusHistory.appendChild(statusItem);
             });
         }
    }
    
    function renderPayments() {
        const paymentStatusValue = paymentStatusFilter.value || 'all';
        const paymentPlanValue = paymentPlanFilter.value || 'all';
        const searchValue = (paymentSearchInput.value || '').toLowerCase().trim();
        
        const paymentApplications = applications.filter(app => {
            let statusMatch = paymentStatusValue === 'all' || (app.paymentStatus || PAYMENT_STATUS.PENDING) === paymentStatusValue;
            let planMatch = paymentPlanValue === 'all' || app.paymentPlan === paymentPlanValue;
            let searchMatch = searchValue === '' || 
                `${app.firstName} ${app.lastName}`.toLowerCase().includes(searchValue) ||
                (app.school && app.school.toLowerCase().includes(searchValue));
            
            return statusMatch && planMatch && searchMatch;
        });
        
        paymentsTableBody.innerHTML = '';
        
        if (paymentApplications.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 9;
            td.className = 'no-data';
            td.textContent = 'No payment records found. Try resetting the filters.';
            tr.appendChild(td);
            paymentsTableBody.appendChild(tr);
            return;
        }
        
        let totalExpected = 0;
        let totalReceived = 0;
        let totalOutstanding = 0;
        
        paymentApplications.forEach(app => {
            const subjectCount = app.selectedSubjects ? app.selectedSubjects.length : 0;
            const paymentPlan = app.paymentPlan || 'upfront';
            const totalAmount = calculateTotalAmount(subjectCount, paymentPlan);
            const amountPaid = calculateAmountPaid(app, totalAmount);
            const balance = totalAmount - amountPaid;
            
            totalExpected += totalAmount;
            totalReceived += amountPaid;
            totalOutstanding += balance;
            
            const row = document.createElement('tr');
            
            const tdName = document.createElement('td');
            tdName.textContent = `${app.firstName} ${app.lastName}`;
            row.appendChild(tdName);
            
            const tdGrade = document.createElement('td');
            tdGrade.textContent = `Grade ${app.grade}`;
            row.appendChild(tdGrade);
            
            const tdPlan = document.createElement('td');
            tdPlan.textContent = formatPaymentPlan(paymentPlan);
            row.appendChild(tdPlan);
            
            const tdPaymentStatus = document.createElement('td');
            const spanPaymentStatus = document.createElement('span');
            spanPaymentStatus.className = `status-badge payment-status-${app.paymentStatus || PAYMENT_STATUS.PENDING}`;
            spanPaymentStatus.textContent = app.paymentStatus || PAYMENT_STATUS.PENDING;
            tdPaymentStatus.appendChild(spanPaymentStatus);
            row.appendChild(tdPaymentStatus);
            
            const tdTotalAmount = document.createElement('td');
            tdTotalAmount.textContent = `R${totalAmount.toFixed(2)}`;
            row.appendChild(tdTotalAmount);
            
            const tdAmountPaid = document.createElement('td');
            tdAmountPaid.textContent = `R${amountPaid.toFixed(2)}`;
            row.appendChild(tdAmountPaid);
            
            const tdBalance = document.createElement('td');
            tdBalance.textContent = `R${balance.toFixed(2)}`;
            tdBalance.style.color = balance > 0 ? 'var(--danger)' : 'var(--success)';
            row.appendChild(tdBalance);
            
            const tdLastPayment = document.createElement('td');
            tdLastPayment.textContent = getLastPaymentDate(app);
            row.appendChild(tdLastPayment);
            
            const tdActions = document.createElement('td');
            const button = document.createElement('button');
            button.className = 'btn btn-outline view-app-btn';
            button.dataset.id = app.id;
            const i = document.createElement('i');
            i.className = 'fas fa-eye';
            button.appendChild(i);
            button.appendChild(document.createTextNode(' View'));
            tdActions.appendChild(button);
            row.appendChild(tdActions);
            
            paymentsTableBody.appendChild(row);
        });
        
        // Update payment summary
        document.getElementById('totalExpectedRevenue').textContent = `R${totalExpected.toFixed(2)}`;
        document.getElementById('totalReceived').textContent = `R${totalReceived.toFixed(2)}`;
        document.getElementById('totalOutstanding').textContent = `R${totalOutstanding.toFixed(2)}`;
        
        document.querySelectorAll('#paymentsTableBody .view-app-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const appId = btn.getAttribute('data-id');
                viewApplication(appId);
            });
        });
    }
    
    function calculateTotalAmount(subjectCount, paymentPlan) {
        if (subjectCount === 0) return 0;
        const count = Math.min(Math.max(subjectCount, 1), 4);
        if (!FEE_STRUCTURE[count] || !FEE_STRUCTURE[count][paymentPlan]) {
             console.warn(`Missing fee structure for count: ${count}, plan: ${paymentPlan}`);
             return 0;
        }
        return FEE_STRUCTURE[count][paymentPlan] || 0;
    }
    
    function calculateAmountPaid(app, totalAmount) {
        if (app.paymentStatus === PAYMENT_STATUS.FULLY_PAID) {
            return totalAmount;
        }

        let amountPaid = 0;

        if (app.paymentStatus === PAYMENT_STATUS.APPLICATION_PAID || app.paymentStatus === PAYMENT_STATUS.FULLY_PAID) {
            amountPaid = 200;
        }

        if (app.payments) {
            Object.values(app.payments).forEach(payment => {
                if (payment.paid && payment.amount) {
                    amountPaid += payment.amount;
                }
            });
        }
        
        return amountPaid;
    }
    
    function formatPaymentPlan(plan) {
        const planNames = {
            'upfront': 'Upfront Payment',
            'sixMonths': '6 Months Installment',
            'tenMonths': '10 Months Installment'
        };
        return planNames[plan] || plan || 'N/A';
    }
    
    function getLastPaymentDate(app) {
        if (!app.payments) return 'N/A';
        
        const paidPayments = Object.values(app.payments).filter(p => p.paid && p.paidAt);
        if (paidPayments.length === 0) return 'N/A';
        
        const lastPayment = paidPayments.reduce((latest, payment) => {
            const paymentDate = new Date(payment.paidAt);
            return paymentDate > latest ? paymentDate : latest;
        }, new Date(0));
        
        return formatDate(lastPayment);
    }
    
    function filterApplications() {
        const statusValue = statusFilter.value || 'all';
        const gradeValue = gradeFilter.value || 'all';
        const paymentValue = paymentFilter.value || 'all';
        const searchValue = (searchInput.value || '').toLowerCase().trim();
        
        filteredApplications = applications.filter(app => {
            let statusMatch = statusValue === 'all' || (app.status || STATUS.SUBMITTED) === statusValue;
            let gradeMatch = gradeValue === 'all' || (app.grade && app.grade.toString() === gradeValue);
            let paymentMatch = paymentValue === 'all' || (app.paymentStatus || PAYMENT_STATUS.PENDING) === paymentValue;
            let searchMatch = searchValue === '' || 
                `${app.firstName} ${app.lastName}`.toLowerCase().includes(searchValue) ||
                (app.school && app.school.toLowerCase().includes(searchValue)) ||
                (app.selectedSubjects && app.selectedSubjects.join(',').toLowerCase().includes(searchValue)) ||
                (app.status || STATUS.SUBMITTED).toLowerCase().includes(searchValue);
            
            return statusMatch && gradeMatch && paymentMatch && searchMatch;
        });
        
        currentPage = 1;
        renderApplications();
        updatePagination();
    }
    
    function updatePagination() {
        const totalPages = filteredApplications.length > 0 ? Math.ceil(filteredApplications.length / APPLICATIONS_PER_PAGE) : 1;
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || filteredApplications.length === 0;
    }
    
    function goToPrevPage() {
        if (currentPage > 1) {
            currentPage--;
            renderApplications();
            updatePagination();
        }
    }
    
    function goToNextPage() {
        const totalPages = Math.ceil(filteredApplications.length / APPLICATIONS_PER_PAGE);
        
        if (currentPage < totalPages) {
            currentPage++;
            renderApplications();
            updatePagination();
        }
    }
    
    function renderEnhancedPaymentHistory(app, totalAmount, amountPaid, balance) {
        const paymentHistory = document.getElementById('paymentHistory');
        const paymentTotalDue = document.getElementById('paymentTotalDue');
        const paymentTotalPaid = document.getElementById('paymentTotalPaid');
        const paymentRemainingBalance = document.getElementById('paymentRemainingBalance');
        
        paymentTotalDue.textContent = `R${totalAmount.toFixed(2)}`;
        paymentTotalPaid.textContent = `R${amountPaid.toFixed(2)}`;
        paymentRemainingBalance.textContent = `R${balance.toFixed(2)}`;
        paymentRemainingBalance.style.color = balance > 0 ? 'var(--danger)' : 'var(--success)';
        
        paymentHistory.innerHTML = '';
        
        if (app.paymentStatus === PAYMENT_STATUS.APPLICATION_PAID || app.paymentStatus === PAYMENT_STATUS.FULLY_PAID) {
            const paymentItem = document.createElement('div');
            paymentItem.className = 'payment-item detailed';
            paymentItem.innerHTML = `
                <div class="payment-info">
                    <div class="payment-header">
                        <span class="payment-title">Application Fee</span>
                        <span class="payment-amount">R200.00</span>
                    </div>
                    <div class="payment-details">
                        <span class="payment-date">Paid on application submission</span>
                        <span class="payment-status paid">Paid</span>
                    </div>
                </div>
                <button class="btn btn-outline view-payment-details" data-type="application" data-amount="200.00">
                    <i class="fas fa-info-circle"></i> Details
                </button>
            `;
            paymentHistory.appendChild(paymentItem);
        }
        
        if (app.payments) {
            Object.entries(app.payments).forEach(([monthKey, payment]) => {
                const monthName = formatMonthKey(monthKey);
                const paymentItem = document.createElement('div');
                paymentItem.className = `payment-item detailed ${payment.paid ? 'paid' : 'pending'}`;
                
                paymentItem.innerHTML = `
                    <div class="payment-info">
                        <div class="payment-header">
                            <span class="payment-title">${monthName} Installment</span>
                            <span class="payment-amount">R${payment.amount?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div class="payment-details">
                            <span class="payment-date">${payment.paid ? `Paid on ${formatDate(payment.paidAt)}` : 'Pending Payment'}</span>
                            <span class="payment-status ${payment.paid ? 'paid' : 'pending'}">${payment.paid ? 'Paid' : 'Pending'}</span>
                        </div>
                    </div>
                    ${payment.paid ? `
                    <button class="btn btn-outline view-payment-details" 
                            data-type="monthly" 
                            data-month="${monthName}"
                            data-amount="${payment.amount}"
                            data-date="${payment.paidAt}"
                            data-reference="${payment.reference || 'N/A'}">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                    ` : '<span class="payment-pending">Awaiting Payment</span>'}
                `;
                paymentHistory.appendChild(paymentItem);
            });
        }
        
        if (app.paymentPlan === 'upfront' && app.paymentStatus === PAYMENT_STATUS.FULLY_PAID) {
            const upfrontAmount = totalAmount - 200;
            if (upfrontAmount > 0) {
                const paymentItem = document.createElement('div');
                paymentItem.className = 'payment-item detailed paid';
                paymentItem.innerHTML = `
                    <div class="payment-info">
                        <div class="payment-header">
                            <span class="payment-title">Upfront Tuition Payment</span>
                            <span class="payment-amount">R${upfrontAmount.toFixed(2)}</span>
                        </div>
                        <div class="payment-details">
                            <span class="payment-date">Full payment completed</span>
                            <span class="payment-status paid">Paid</span>
                        </div>
                    </div>
                    <button class="btn btn-outline view-payment-details" data-type="upfront" data-amount="${upfrontAmount}">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                `;
                paymentHistory.appendChild(paymentItem);
            }
        }
        
        if (paymentHistory.children.length === 0) {
            const p = document.createElement('p');
            p.className = 'no-data';
            p.textContent = 'No payment history available';
            paymentHistory.appendChild(p);
        }
        
        document.querySelectorAll('.view-payment-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.getAttribute('data-type');
                const amount = btn.getAttribute('data-amount');
                const month = btn.getAttribute('data-month');
                const date = btn.getAttribute('data-date');
                const reference = btn.getAttribute('data-reference');
                
                showPaymentDetails(type, amount, month, date, reference);
            });
        });
    }
    
    // *** FIXED: Improved payment check to handle undefined payments ***
    function renderMonthlyPaymentSchedule(app, paymentPlan, subjectCount) {
        const monthlyScheduleCard = document.getElementById('monthlyPaymentScheduleCard');
        const monthlyPaymentGrid = document.getElementById('monthlyPaymentGrid');

        if ((paymentPlan === 'sixMonths' || paymentPlan === 'tenMonths') && subjectCount > 0) {
            monthlyScheduleCard.style.display = 'block';
            monthlyPaymentGrid.innerHTML = '';

            const monthsCount = paymentPlan === 'sixMonths' ? 6 : 10;
            const feeData = calculateTotalAmount(subjectCount, paymentPlan);
            if (feeData === 0) {
                 console.warn("Total amount is 0, cannot render monthly schedule.");
                 monthlyScheduleCard.style.display = 'none';
                 return;
            }
            const monthlyAmount = monthsCount > 0 ? (feeData / monthsCount) : 0;

            let startDate;
            if (app.paymentStartDate) {
                try {
                    startDate = new Date(app.paymentStartDate);
                    if (isNaN(startDate.getTime())) {
                        console.warn("Invalid paymentStartDate found, falling back:", app.paymentStartDate);
                        startDate = app.submittedAt ? new Date(app.submittedAt) : new Date();
                    }
                } catch (e) {
                    console.error("Error parsing paymentStartDate, falling back:", e);
                    startDate = app.submittedAt ? new Date(app.submittedAt) : new Date();
                }
            } else {
                 console.warn("paymentStartDate not found, falling back to submittedAt or current date.");
                 startDate = app.submittedAt ? new Date(app.submittedAt) : new Date();
                 if (isNaN(startDate.getTime())) {
                     startDate = new Date();
                 }
            }

            console.log(`Rendering schedule starting from: ${startDate.toISOString()}`);
            const monthNames = getMonthNames(monthsCount, startDate);

            console.log("Payments object available in renderMonthlyPaymentSchedule:", app.payments);

            monthNames.forEach((monthName, index) => {
                const monthKey = monthName.toLowerCase().replace(/ /g, '_');

                // *** FIXED: Improved payment check ***
                let payment = null;
                if (app.payments && typeof app.payments === 'object') {
                    payment = app.payments[monthKey];
                }

                const isPaid = payment?.paid === true;

                console.log(`Month: ${monthName}, Key: ${monthKey}, Payment Data Found:`, payment, `Is Paid: ${isPaid}`);

                const paymentCard = document.createElement('div');
                paymentCard.className = `monthly-payment-card ${isPaid ? 'paid' : 'pending'}`;
                paymentCard.innerHTML = `
                    <div class="payment-month-header">
                        <h4>${monthName}</h4>
                        <span class="payment-status-badge ${isPaid ? 'paid' : 'pending'}">
                            ${isPaid ? '✓ Paid' : 'Pending'}
                        </span>
                    </div>
                    <div class="payment-month-details">
                        <div class="payment-amount">R${monthlyAmount.toFixed(2)}</div>
                        <div class="payment-due">Due: ${getDueDate(index, startDate)}</div>
                        ${isPaid ? `
                        <div class="payment-paid-date">Paid: ${payment.paidAt ? formatDate(payment.paidAt) : 'N/A'}</div>
                        <div class="payment-reference">Ref: ${payment.reference || 'N/A'}</div>
                        ` : `
                        <div class="payment-expected">Expected: ${getDueDate(index, startDate)}</div>
                        `}
                    </div>
                    <div class="payment-month-actions">
                        ${isPaid ? `
                        <button class="btn btn-outline view-payment-btn"
                                data-month="${monthName}"
                                data-amount="${payment.amount ? payment.amount.toFixed(2) : monthlyAmount.toFixed(2)}"
                                data-date="${payment.paidAt || ''}"
                                data-reference="${payment.reference || 'N/A'}">
                            View Details
                        </button>
                        ` : `
                        <span class="payment-awaiting">Awaiting Payment</span>
                        `}
                    </div>
                `;
                monthlyPaymentGrid.appendChild(paymentCard);
            });

            document.querySelectorAll('.view-payment-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const month = btn.getAttribute('data-month');
                    const amount = btn.getAttribute('data-amount');
                    const date = btn.getAttribute('data-date');
                    const reference = btn.getAttribute('data-reference');

                    showPaymentDetails('monthly', amount, month, date, reference);
                });
            });

        } else {
            console.log('Not rendering monthly schedule (not installment plan or zero subjects). Plan:', paymentPlan, 'Subjects:', subjectCount);
            monthlyScheduleCard.style.display = 'none';
        }
    }
    
    function showPaymentDetails(type, amount, month, date, reference) {
        if (!paymentDetailModal) return;
        
        const modalStudentName = document.getElementById('modalStudentName');
        const modalPaymentFor = document.getElementById('modalPaymentFor');
        const modalPaymentAmount = document.getElementById('modalPaymentAmount');
        const modalPaymentDate = document.getElementById('modalPaymentDate');
        const modalPaymentMethod = document.getElementById('modalPaymentMethod');
        const modalPaymentReference = document.getElementById('modalPaymentReference');
        const modalPaymentStatus = document.getElementById('modalPaymentStatus');
        
        if (!currentApplication) return;
        
        modalStudentName.textContent = `${currentApplication.firstName} ${currentApplication.lastName}`;
        modalPaymentAmount.textContent = `R${parseFloat(amount).toFixed(2)}`;
        modalPaymentMethod.textContent = 'Paystack';
        modalPaymentReference.textContent = reference || 'N/A';
        modalPaymentStatus.textContent = 'Completed';
        
        switch (type) {
            case 'application':
                modalPaymentFor.textContent = 'Application Fee';
                modalPaymentDate.textContent = 'Paid on application submission';
                break;
            case 'upfront':
                modalPaymentFor.textContent = 'Upfront Tuition Payment';
                modalPaymentDate.textContent = 'Full payment completed';
                break;
            case 'monthly':
                modalPaymentFor.textContent = `${month} Installment`;
                modalPaymentDate.textContent = formatDate(date);
                break;
        }
        
        paymentDetailModal.style.display = 'flex';
    }
    
    function formatMonthKey(monthKey) {
        return monthKey.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    function getMonthNames(monthsCount, startDateInput = new Date()) {
        let startDate = startDateInput instanceof Date && !isNaN(startDateInput) ? startDateInput : new Date();
        const monthNames = [];

        for (let i = 0; i < monthsCount; i++) {
            try {
                const targetMonth = startDate.getMonth() + i;
                const targetYear = startDate.getFullYear() + Math.floor(targetMonth / 12);
                const monthIndexInYear = targetMonth % 12;

                const date = new Date(targetYear, monthIndexInYear, 1);
                 if (isNaN(date.getTime())) {
                     console.error(`Invalid date generated for index ${i} from start date ${startDate.toISOString()}`);
                     monthNames.push("Invalid Month");
                     continue;
                 }
                const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                monthNames.push(monthName);
            } catch (e) {
                 console.error(`Error calculating month name for index ${i}:`, e);
                 monthNames.push("Error Month");
            }
        }
        console.log(`Generated month names (${monthsCount}) starting ${startDate.toISOString()}:`, monthNames);
        return monthNames;
    }
    
    function getDueDate(monthIndex, startDateInput = new Date()) {
         let startDate = startDateInput instanceof Date && !isNaN(startDateInput) ? startDateInput : new Date();
         try {
            const targetMonth = startDate.getMonth() + monthIndex;
            const targetYear = startDate.getFullYear() + Math.floor(targetMonth / 12);
            const monthIndexInYear = targetMonth % 12;

            const dueDate = new Date(targetYear, monthIndexInYear, 15);
            if (isNaN(dueDate.getTime())) {
                console.error(`Invalid due date generated for index ${monthIndex} from start date ${startDate.toISOString()}`);
                return "Invalid Date";
            }
            return dueDate.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
         } catch(e) {
             console.error(`Error calculating due date for index ${monthIndex}:`, e);
             return "Error Date";
         }
    }
    
    function createStatusItem(text, dateText, iconClass, color) {
        const statusItem = document.createElement('div');
        statusItem.className = 'status-item';
        
        const i = document.createElement('i');
        i.className = `fas ${iconClass}`;
        i.style.color = color;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'status-content';
        
        const p = document.createElement('p');
        p.textContent = text;
        
        const span = document.createElement('span');
        span.className = 'status-date';
        span.textContent = dateText;
        
        contentDiv.appendChild(p);
        contentDiv.appendChild(span);
        
        statusItem.appendChild(i);
        statusItem.appendChild(contentDiv);
        
        return statusItem;
    }
    
    async function updateApplicationStatus() {
        if (!currentApplication || !checkFirebaseAvailability()) return;
        
        const newStatus = statusChangeSelect.value;
        if (!confirm(`Are you sure you want to change the status to ${newStatus}?`)) {
            return;
        }
        
        try {
            showLoading(true);
            const { doc, updateDoc, serverTimestamp, arrayUnion } = window.firebase;
            
            const currentTimestamp = new Date();
            
            const statusUpdate = {
                status: newStatus,
                timestamp: currentTimestamp,
                updatedBy: adminName.textContent
            };
            
            const updateData = {
                status: newStatus,
                lastStatusUpdateTimestamp: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            if (arrayUnion) {
                updateData.statusUpdates = arrayUnion(statusUpdate);
            } else {
                const appRef = doc(window.firebase.db, "applications", currentApplication.id);
                const docSnap = await window.firebase.getDoc(appRef);
                if (docSnap.exists()) {
                    const existingData = docSnap.data();
                    const existingUpdates = existingData.statusUpdates || [];
                    updateData.statusUpdates = [...existingUpdates, statusUpdate];
                } else {
                    updateData.statusUpdates = [statusUpdate];
                }
            }
            
            const appRef = doc(window.firebase.db, "applications", currentApplication.id);
            await updateDoc(appRef, updateData);
            
            const appIndex = applications.findIndex(app => app.id === currentApplication.id);
            if (appIndex !== -1) {
                applications[appIndex].status = newStatus;
                if (!applications[appIndex].statusUpdates) {
                    applications[appIndex].statusUpdates = [];
                }
                applications[appIndex].statusUpdates.push({
                    status: newStatus,
                    timestamp: currentTimestamp,
                    updatedBy: adminName.textContent
                });
            }
            
            localStorage.setItem('cachedApplications', JSON.stringify({
                data: applications.map(app => ({
                    ...app,
                    submittedAt: app.submittedAt.toISOString(),
                    statusUpdates: app.statusUpdates ? app.statusUpdates.map(update => ({
                        ...update,
                        timestamp: update.timestamp.toISOString()
                    })) : []
                })),
                timestamp: Date.now()
            }));

            updateStats();
            filterApplications();
            
            alert(`Application status updated to ${newStatus}`);
            
            if (newStatus === 'approved') {
                showToast('Student can now proceed with tuition payments', 'success');
            }
            
        } catch (error) {
            console.error("Error updating application status:", error);
            alert("Failed to update application status: " + error.message);
        } finally {
            showLoading(false);
        }
    }
    
    function downloadApplicationPDF() {
        if (!currentApplication) return;
        
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert("PDF library not loaded. Please try again.");
            return;
        }
        
        const doc = new jsPDF();
        let y = 10;
        
        doc.setFontSize(16);
        doc.text(`Application Details: ${currentApplication.firstName} ${currentApplication.lastName}`, 10, y);
        y += 10;
        
        doc.setFontSize(12);
        y = addPdfText(doc, `Email: ${currentApplication.email || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Phone: ${currentApplication.phone || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Grade: ${currentApplication.grade || 'N/A'}`, 10, y);
        y = addPdfText(doc, `School: ${currentApplication.school || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Gender: ${currentApplication.gender || 'N/A'}`, 10, y);
        
        y = addPdfText(doc, 'Payment Information:', 10, y);
        y = addPdfText(doc, `Status: ${currentApplication.paymentStatus || 'Pending'}`, 15, y, 5);
        y = addPdfText(doc, `Plan: ${formatPaymentPlan(currentApplication.paymentPlan || 'upfront')}`, 15, y, 5);
        
        y = addPdfText(doc, 'Subjects:', 10, y);
        if (currentApplication.selectedSubjects) {
            currentApplication.selectedSubjects.forEach(subject => {
                y = addPdfText(doc, `- ${subject}`, 15, y, 5);
            });
        } else {
            y = addPdfText(doc, 'No subjects selected', 15, y, 5);
        }
        
        y = addPdfText(doc, 'Parent/Guardian Information:', 10, y);
        y = addPdfText(doc, `Name: ${currentApplication.parentName || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Relationship: ${currentApplication.parentRelationship || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Phone: ${currentApplication.parentPhone || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Email: ${currentApplication.parentEmail || 'N/A'}`, 10, y);
        
        doc.save(`application_${currentApplication.id}.pdf`);
    }
    
    function addPdfText(doc, text, x, y, increment = 10) {
        const lines = doc.splitTextToSize(text, 180);
        doc.text(lines, x, y);
        return y + (lines.length * increment);
    }
    
    function loadAnalytics() {
        const gradeCounts = {};
        applications.forEach(app => {
            const grade = app.grade;
            gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
        });
        
        const gradeChart = new Chart(document.getElementById('gradeChart'), {
            type: 'bar',
            data: {
                labels: Object.keys(gradeCounts).map(g => `Grade ${g}`),
                datasets: [{
                    label: 'Applications by Grade',
                    data: Object.values(gradeCounts),
                    backgroundColor: '#2e5c89',
                    borderColor: '#254267',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
        
        const statusCounts = {
            [STATUS.SUBMITTED]: 0,
            [STATUS.UNDER_REVIEW]: 0,
            [STATUS.APPROVED]: 0,
            [STATUS.REJECTED]: 0
        };
        
        applications.forEach(app => {
            const status = app.status || STATUS.SUBMITTED;
            statusCounts[status]++;
        });
        
        const statusChart = new Chart(document.getElementById('statusChart'), {
            type: 'pie',
            data: {
                labels: ['Submitted', 'Under Review', 'Approved', 'Rejected'],
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#3182ce', '#ed8936', '#48bb78', '#f56565'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        const paymentCounts = {
            [PAYMENT_STATUS.PENDING]: 0,
            [PAYMENT_STATUS.APPLICATION_PAID]: 0,
            [PAYMENT_STATUS.FULLY_PAID]: 0
        };
        
        applications.forEach(app => {
            const paymentStatus = app.paymentStatus || PAYMENT_STATUS.PENDING;
            paymentCounts[paymentStatus]++;
        });
        
        const paymentChart = new Chart(document.getElementById('paymentChart'), {
            type: 'doughnut',
            data: {
                labels: ['Payment Pending', 'App Fee Paid', 'Fully Paid'],
                datasets: [{
                    data: Object.values(paymentCounts),
                    backgroundColor: ['#f6ad55', '#4299e1', '#48bb78'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        let totalRevenue = 0;
        let receivedRevenue = 0;
        
        applications.forEach(app => {
            const subjectCount = app.selectedSubjects ? app.selectedSubjects.length : 0;
            const paymentPlan = app.paymentPlan || 'upfront';
            const totalAmount = calculateTotalAmount(subjectCount, paymentPlan);
            const amountPaid = calculateAmountPaid(app, totalAmount);
            
            totalRevenue += totalAmount;
            receivedRevenue += amountPaid;
        });
        
        const outstandingRevenue = totalRevenue - receivedRevenue;
        
        const revenueChart = new Chart(document.getElementById('revenueChart'), {
            type: 'bar',
            data: {
                labels: ['Total Expected', 'Received', 'Outstanding'],
                datasets: [{
                    label: 'Revenue (R)',
                    data: [totalRevenue, receivedRevenue, outstandingRevenue],
                    backgroundColor: ['#2e5c89', '#48bb78', '#f56565'],
                    borderWidth: 1
            }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    function formatDate(date) {
        if (!date) return 'N/A';
        
        try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            if (isNaN(dateObj.getTime())) return 'N/A';
            return dateObj.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.warn("Invalid date format:", date);
            return 'N/A';
        }
    }
    
    function showLoading(show) {
        let loadingElement = document.getElementById('loadingIndicator');
        if (!loadingElement && show) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'loadingIndicator';
            loadingElement.className = 'loading-indicator';
            loadingElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            document.body.appendChild(loadingElement);
        } else if (loadingElement && !show) {
            loadingElement.remove();
        }
    }

    function showToast(message, type = 'info') {
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
            `;
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.cssText = `
            background-color: ${type === 'success' ? '#44c0b6' : type === 'error' ? '#e64a2e' : type === 'warning' ? '#ff9800' : '#2e5c89'};
            color: white;
            padding: 12px 20px;
            margin-bottom: 10px;
            border-radius: 5px;
            display: flex;
            align-items: center;
            animation: slideIn 0.5s, fadeOut 0.5s 3.5s forwards;
        `;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type] || 'fa-info-circle'}" style="margin-right: 10px;"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode === toastContainer) {
                    toastContainer.removeChild(toast);
                }
            }, 500);
        }, 4000);
    }

    if (!document.querySelector('#toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            @keyframes slideIn {
                from { opacity: 0; transform: translateX(100%); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes fadeOut {
                to { opacity: 0; transform: translateX(100%); }
            }
        `;
        document.head.appendChild(style);
    }
});