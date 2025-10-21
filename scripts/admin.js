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
    
    // State
    let applications = [];
    let currentApplication = null;
    
    // Pagination
    let currentPage = 1;
    let filteredApplications = [];
    
    // Sorting
    let sortColumn = null;
    let sortDirection = 'asc';

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
    
    // Debounce for search
    let searchTimeout;
    let paymentSearchTimeout;

    // Initialize
    checkAuthState();
    
    // Functions
    async function checkAuthState() {
        if (!window.firebase) {
            console.error("Firebase is not initialized");
            alert("Application error: Firebase is not available. Please contact support.");
            return;
        }

        const { onAuthStateChanged, doc, getDoc } = window.firebase;

        onAuthStateChanged(window.firebase.auth, async (user) => {
            if (user) {
                try {
                    const adminDoc = await getDoc(doc(window.firebase.db, "admins", user.uid));
                    if (adminDoc.exists() && adminDoc.data().role === "admin") {
                        loginSection.style.display = 'none';
                        dashboardSection.style.display = 'block';
                        adminAvatar.textContent = user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase();
                        adminName.textContent = user.displayName || user.email;
                        loadApplications();
                    } else {
                        alert("You don't have permission to access the admin portal.");
                        handleLogout();
                    }
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    alert("Authentication error: " + error.message);
                    handleLogout();
                }
            } else {
                loginSection.style.display = 'flex';
                dashboardSection.style.display = 'none';
            }
        });
    }
    
    function handleGoogleSignIn() {
        if (!window.firebase) return;

        const { signInWithPopup, GoogleAuthProvider } = window.firebase;
        const provider = new GoogleAuthProvider();
        
        signInWithPopup(window.firebase.auth, provider)
            .catch(error => {
                console.error("Google Sign-In Error:", error);
                alert("Sign in failed: " + error.message);
            });
    }
    
    function handleLogout() {
        if (confirm("Are you sure you want to log out?")) {
            if (!window.firebase) return;
            const { signOut } = window.firebase;
            signOut(window.firebase.auth);
        }
    }
    
    function showSection(sectionId) {
        console.log(`Attempting to show section: ${sectionId}`);
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
    
    async function loadApplications() {
        if (!window.firebase) return;

        const cached = localStorage.getItem('cachedApplications');
        if (cached) {
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
            }
        }

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
        } catch (error) {
            console.error("Error loading applications:", error);
            alert("Failed to load applications: " + error.message);
        } finally {
            showLoading(false);
        }
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

    function renderPayments() {
        const paymentStatusValue = paymentStatusFilter.value || 'all';
        const paymentPlanValue = paymentPlanFilter.value || 'all';
        const searchValue = (paymentSearchInput.value || '').toLowerCase().trim();
        
        const paymentApplications = applications.filter(app => {
            let statusMatch = paymentStatusValue === 'all' || (app.paymentStatus || PAYMENT_STATUS.PENDING) === paymentStatusValue;
            let planMatch = paymentPlanValue === 'all' || app.paymentPlan === paymentPlanValue;
            let searchMatch = searchValue === '' || 
                `${app.firstName} ${app.lastName}`.toLowerCase().includes(searchValue) ||
                app.school.toLowerCase().includes(searchValue);
            
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
        return FEE_STRUCTURE[count][paymentPlan] || 0;
    }
    
    function calculateAmountPaid(app, totalAmount) {
        if (app.paymentStatus === PAYMENT_STATUS.FULLY_PAID) {
            return totalAmount;
        } else if (app.paymentStatus === PAYMENT_STATUS.APPLICATION_PAID) {
            return 200; // Application fee
        }
        
        // Calculate based on monthly payments
        let amountPaid = 0;
        if (app.payments) {
            Object.values(app.payments).forEach(payment => {
                if (payment.paid) {
                    amountPaid += payment.amount || 0;
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
        return planNames[plan] || plan;
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
            let gradeMatch = gradeValue === 'all' || app.grade.toString() === gradeValue;
            let paymentMatch = paymentValue === 'all' || (app.paymentStatus || PAYMENT_STATUS.PENDING) === paymentValue;
            let searchMatch = searchValue === '' || 
                `${app.firstName} ${app.lastName}`.toLowerCase().includes(searchValue) ||
                app.school.toLowerCase().includes(searchValue) ||
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
    
    function viewApplication(appId) {
        console.log(`Loading application details for ID: ${appId}`);
        currentApplication = applications.find(app => app.id === appId);
        
        if (!currentApplication) {
            console.error(`Application with ID ${appId} not found`);
            alert('Application not found. Please try again.');
            return;
        }
        
        const requiredIds = [
            'detailName', 'detailEmail', 'detailPhone', 'detailGrade', 'detailSchool', 'detailGender',
            'detailSubjects', 'detailParentName', 'detailParentRelationship', 'detailParentPhone',
            'detailParentEmail', 'reportCardLink', 'idDocumentLink', 'statusChangeSelect', 'statusHistory',
            'detailPaymentStatus', 'detailPaymentPlan', 'detailTotalAmount', 'detailAmountPaid', 'detailBalance',
            'paymentHistory'
        ];
        for (const id of requiredIds) {
            if (!document.getElementById(id)) {
                console.error(`DOM element with ID ${id} not found`);
                alert('Application details view is misconfigured. Please contact support.');
                return;
            }
        }
        
        document.getElementById('detailName').textContent = `${currentApplication.firstName || ''} ${currentApplication.lastName || ''}` || 'Not provided';
        document.getElementById('detailEmail').textContent = currentApplication.email || 'N/A';
        document.getElementById('detailPhone').textContent = currentApplication.phone || 'N/A';
        document.getElementById('detailGrade').textContent = currentApplication.grade ? `Grade ${currentApplication.grade}` : 'N/A';
        document.getElementById('detailSchool').textContent = currentApplication.school || 'N/A';
        document.getElementById('detailGender').textContent = currentApplication.gender || 'N/A';
        
        // Payment Information
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
        
        // Payment History
        const paymentHistory = document.getElementById('paymentHistory');
        paymentHistory.innerHTML = '';
        
        if (currentApplication.paymentStatus === PAYMENT_STATUS.APPLICATION_PAID || currentApplication.paymentStatus === PAYMENT_STATUS.FULLY_PAID) {
            const paymentItem = document.createElement('div');
            paymentItem.className = 'payment-item';
            paymentItem.innerHTML = `
                <div class="payment-info">
                    <span class="payment-amount">Application Fee: R200.00</span>
                    <span class="payment-date">Paid on application submission</span>
                </div>
                <span class="status-badge payment-status-application_paid">Paid</span>
            `;
            paymentHistory.appendChild(paymentItem);
        }
        
        if (currentApplication.payments) {
            Object.entries(currentApplication.payments).forEach(([month, payment]) => {
                if (payment.paid) {
                    const paymentItem = document.createElement('div');
                    paymentItem.className = 'payment-item';
                    paymentItem.innerHTML = `
                        <div class="payment-info">
                            <span class="payment-amount">${month} Installment: R${payment.amount?.toFixed(2) || '0.00'}</span>
                            <span class="payment-date">Paid on ${formatDate(payment.paidAt)}</span>
                        </div>
                        <span class="status-badge payment-status-fully_paid">Paid</span>
                    `;
                    paymentHistory.appendChild(paymentItem);
                }
            });
        }
        
        if (paymentHistory.children.length === 0) {
            const p = document.createElement('p');
            p.className = 'no-data';
            p.textContent = 'No payment history available';
            paymentHistory.appendChild(p);
        }
        
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
                    icon = 'fa-times-circle';
                    color = 'var(--danger)';
                } else if (update.status === STATUS.UNDER_REVIEW) {
                    icon = 'fa-clock';
                    color = 'var(--warning)';
                }
                
                const statusItem = createStatusItem(`Status changed to ${update.status}`, formatDate(update.timestamp), icon, color);
                statusHistory.appendChild(statusItem);
            });
        }
        
        showSection('applicationDetail');
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
    if (!currentApplication || !window.firebase) return;
    
    const newStatus = statusChangeSelect.value;
    if (!confirm(`Are you sure you want to change the status to ${newStatus}?`)) {
        return;
    }
    
    try {
        showLoading(true);
        const { doc, updateDoc, serverTimestamp, arrayUnion } = window.firebase;
        
        // Get the current timestamp for the status update
        const currentTimestamp = new Date();
        
        // Create the status update object
        const statusUpdate = {
            status: newStatus,
            timestamp: currentTimestamp,
            updatedBy: adminName.textContent
        };
        
        // Update the document with status and append to statusUpdates array
        const updateData = {
            status: newStatus,
            lastStatusUpdateTimestamp: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        // Only add to statusUpdates array if it exists and arrayUnion is available
        if (arrayUnion) {
            updateData.statusUpdates = arrayUnion(statusUpdate);
        } else {
            // Fallback: manually manage the array
            const appRef = doc(window.firebase.db, "applications", currentApplication.id);
            const docSnap = await window.firebaseGetDoc(appRef);
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
        
        // Update local state
        currentApplication.status = newStatus;
        if (!currentApplication.statusUpdates) {
            currentApplication.statusUpdates = [];
        }
        currentApplication.statusUpdates.push({
            status: newStatus,
            timestamp: currentTimestamp,
            updatedBy: adminName.textContent
        });
        
        const appIndex = applications.findIndex(app => app.id === currentApplication.id);
        if (appIndex !== -1) {
            applications[appIndex] = { ...currentApplication };
        }
        
        // Update cache
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

        // Update UI
        updateStats();
        filterApplications();
        
        const statusHistory = document.getElementById('statusHistory');
        let icon = 'fa-check-circle';
        let color = 'var(--success)';
        
        if (newStatus === STATUS.REJECTED) {
            icon = 'fa-times-circle';
            color = 'var(--danger)';
        } else if (newStatus === STATUS.UNDER_REVIEW) {
            icon = 'fa-clock';
            color = 'var(--warning)';
        }
        
        const statusItem = createStatusItem(
            `Status changed to ${newStatus}`,
            `${formatDate(currentTimestamp)} (by ${adminName.textContent})`,
            icon,
            color
        );
        statusHistory.appendChild(statusItem);
        
        alert(`Application status updated to ${newStatus}`);
        
        // If status is approved, show payment options to student
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
        // Grade Distribution Chart
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
        
        // Status Distribution Chart
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
        
        // Payment Status Chart
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
        
        // Revenue Chart
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

    // Toast notification function for admin.js
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
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
    
    // Add enter animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode === toastContainer) {
                toastContainer.removeChild(toast);
            }
        }, 500);
    }, 4000);
}

// Add CSS animations for toast
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