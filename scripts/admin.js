// Admin Dashboard JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Constants
    const STATUS = {
        SUBMITTED: 'submitted',
        UNDER_REVIEW: 'under-review',
        APPROVED: 'approved',
        REJECTED: 'rejected'
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
    const statusFilter = document.getElementById('statusFilter');
    const gradeFilter = document.getElementById('gradeFilter');
    const searchInput = document.getElementById('searchInput');
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
    
    // Debounce for search
    let searchTimeout;

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
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(filterApplications, 300);
    });
    saveStatusBtn.addEventListener('click', updateApplicationStatus);
    downloadApplicationBtn.addEventListener('click', downloadApplicationPDF);
    prevPageBtn.addEventListener('click', goToPrevPage);
    nextPageBtn.addEventListener('click', goToNextPage);
    
    // Add sorting listeners
    document.querySelectorAll('.applications-table th').forEach((header, index) => {
        if (index < 6) { // Exclude actions column
            header.classList.add('sortable');
            header.dataset.column = ['name', 'grade', 'school', 'subjects', 'status', 'submitted'][index];
            header.addEventListener('click', sortTable);
        }
    });
    
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
        document.getElementById('rejectedApplications').textContent = applications.filter(app => 
            app.status === STATUS.REJECTED).length || 0;
        
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
            td.colSpan = 7;
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
            tdSubjects.textContent = app.subjects ? app.subjects.slice(0, 2).join(', ') + (app.subjects.length > 2 ? '...' : '') : 'N/A';
            row.appendChild(tdSubjects);
            
            const tdStatus = document.createElement('td');
            const spanStatus = document.createElement('span');
            spanStatus.className = `status-badge status-${app.status || STATUS.SUBMITTED}`;
            spanStatus.textContent = app.status || STATUS.SUBMITTED;
            tdStatus.appendChild(spanStatus);
            row.appendChild(tdStatus);
            
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
    
    function filterApplications() {
        const statusValue = statusFilter.value || 'all';
        const gradeValue = gradeFilter.value || 'all';
        const searchValue = (searchInput.value || '').toLowerCase().trim();
        
        filteredApplications = applications.filter(app => {
            let statusMatch = statusValue === 'all' || (app.status || STATUS.SUBMITTED) === statusValue;
            let gradeMatch = gradeValue === 'all' || app.grade.toString() === gradeValue;
            let searchMatch = searchValue === '' || 
                `${app.firstName} ${app.lastName}`.toLowerCase().includes(searchValue) ||
                app.school.toLowerCase().includes(searchValue) ||
                (app.subjects && app.subjects.join(',').toLowerCase().includes(searchValue)) ||
                (app.status || STATUS.SUBMITTED).toLowerCase().includes(searchValue);
            
            return statusMatch && gradeMatch && searchMatch;
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
    
    function sortTable(e) {
        const column = e.target.dataset.column;
        if (!column) return;
        
        if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = column;
            sortDirection = 'asc';
        }
        
        filteredApplications.sort((a, b) => {
            let valA = getSortValue(a, column);
            let valB = getSortValue(b, column);
            
            let comparison = 0;
            if (typeof valA === 'number' || valA instanceof Date) {
                comparison = valA - valB;
            } else {
                comparison = valA.toString().localeCompare(valB.toString());
            }
            
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        
        renderApplications();
    }
    
    function getSortValue(app, column) {
        switch (column) {
            case 'name':
                return `${app.firstName} ${app.lastName}`;
            case 'grade':
                return parseInt(app.grade, 10);
            case 'school':
                return app.school || '';
            case 'subjects':
                return app.subjects ? app.subjects.join(', ') : '';
            case 'status':
                return app.status || STATUS.SUBMITTED;
            case 'submitted':
                return app.submittedAt;
            default:
                return '';
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
            'detailParentEmail', 'reportCardLink', 'idDocumentLink', 'statusChangeSelect', 'statusHistory'
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
        
        const subjectsContainer = document.getElementById('detailSubjects');
        subjectsContainer.innerHTML = '';
        if (currentApplication.subjects && currentApplication.subjects.length > 0) {
            currentApplication.subjects.forEach(subject => {
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
        
        document.getElementById('detailParentName').textContent = currentApplication.emergencyContact?.name || 'N/A';
        document.getElementById('detailParentRelationship').textContent = currentApplication.emergencyContact?.relation || 'N/A';
        document.getElementById('detailParentPhone').textContent = currentApplication.emergencyContact?.phone || 'N/A';
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
        
        // Update the document with status and append to statusUpdates array
        await updateDoc(doc(window.firebase.db, "applications", currentApplication.id), {
            status: newStatus,
            statusUpdates: arrayUnion({
                status: newStatus,
                timestamp: new Date(), // Use client-side timestamp as fallback
                updatedBy: adminName.textContent
            }),
            lastStatusUpdateTimestamp: serverTimestamp() // Store server timestamp separately
        });
        
        // Update local state
        currentApplication.status = newStatus;
        if (!currentApplication.statusUpdates) {
            currentApplication.statusUpdates = [];
        }
        currentApplication.statusUpdates.push({
            status: newStatus,
            timestamp: new Date(),
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
            `${formatDate(new Date())} (by ${adminName.textContent})`,
            icon,
            color
        );
        statusHistory.appendChild(statusItem);
        
        alert(`Application status updated to ${newStatus}`);
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
        
        y = addPdfText(doc, 'Subjects:', 10, y);
        if (currentApplication.subjects) {
            currentApplication.subjects.forEach(subject => {
                y = addPdfText(doc, `- ${subject}`, 15, y, 5);
            });
        } else {
            y = addPdfText(doc, 'No subjects selected', 15, y, 5);
        }
        
        y = addPdfText(doc, 'Parent/Guardian Information:', 10, y);
        y = addPdfText(doc, `Name: ${currentApplication.emergencyContact?.name || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Relationship: ${currentApplication.emergencyContact?.relation || 'N/A'}`, 10, y);
        y = addPdfText(doc, `Phone: ${currentApplication.emergencyContact?.phone || 'N/A'}`, 10, y);
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
        
        let gradeHtml = '<div class="analytics-data">';
        for (const grade in gradeCounts) {
            const percentage = applications.length > 0 ? ((gradeCounts[grade] / applications.length) * 100).toFixed(1) : 0;
            gradeHtml += `<div class="data-row"><span>Grade ${grade}:</span> <span>${gradeCounts[grade]} (${percentage}%)</span></div>`;
        }
        gradeHtml += '</div>';
        document.getElementById('gradeChart').innerHTML = gradeHtml;
        
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
        
        let statusHtml = '<div class="analytics-data">';
        for (const status in statusCounts) {
            const percentage = applications.length > 0 ? ((statusCounts[status] / applications.length) * 100).toFixed(1) : 0;
            statusHtml += `<div class="data-row"><span>${status}:</span> <span>${statusCounts[status]} (${percentage}%)</span></div>`;
        }
        statusHtml += '</div>';
        document.getElementById('statusChart').innerHTML = statusHtml;
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
});