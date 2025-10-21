
// Enhanced input sanitization with security improvements
export function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove potential HTML tags and limit length for security
    return input
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .substring(0, 500); // Limit length to prevent abuse
}

// Enhanced email validation with better regex and length check
export function validateEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

// Enhanced phone validation for South Africa
export function validatePhone(phone) {
    if (!phone) return false;
    // South African phone number regex (10-11 digits, may start with +27 or 0)
    const phoneRegex = /^(\+27|0)[6-8][0-9]{8}$/;
    const cleaned = phone.replace(/\s+/g, '');
    return phoneRegex.test(cleaned);
}

// Enhanced ID validation for South Africa
export function validateId(idNumber) {
    if (!idNumber) return false;
    // Basic South African ID validation (13 digits)
    const idRegex = /^[0-9]{13}$/;
    return idRegex.test(idNumber.replace(/\s+/g, ''));
}

// Enhanced date validation with future date prevention
export function validateDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    return date instanceof Date && !isNaN(date) && date <= today;
}

// Enhanced file validation with security checks
export function validateFile(file, allowedTypes, maxSize) {
    if (!file) return false;
    
    // Check file type
    if (!allowedTypes.includes(file.type)) {
        console.warn('Invalid file type:', file.type);
        return false;
    }
    
    // Check file size
    if (file.size > maxSize) {
        console.warn('File too large:', file.size);
        return false;
    }
    
    // Check file name for potential security issues
    const fileName = file.name.toLowerCase();
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.html'];
    if (dangerousExtensions.some(ext => fileName.endsWith(ext))) {
        console.warn('Potentially dangerous file type:', file.name);
        return false;
    }
    
    return true;
}

// Enhanced toast notifications with types and animations
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        console.warn('Toast container not found');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
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

// Enhanced debounce function with immediate option
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

// Enhanced form validation with specific field feedback
export function validateFormField(field, value) {
    const errors = [];
    
    switch(field) {
        case 'email':
            if (!validateEmail(value)) errors.push('Please enter a valid email address');
            break;
        case 'phone':
            if (!validatePhone(value)) errors.push('Please enter a valid South African phone number');
            break;
        case 'idNumber':
            if (!validateId(value)) errors.push('Please enter a valid 13-digit ID number');
            break;
        case 'date':
            if (!validateDate(value)) errors.push('Please enter a valid date');
            break;
        case 'required':
            if (!value || value.trim().length === 0) errors.push('This field is required');
            break;
    }
    
    return errors;
}

// Progress tracking utility
export function updateProgressIndicator(step) {
    const steps = ['application', 'consent', 'rules', 'pledge'];
    const currentIndex = steps.indexOf(step);
    
    if (currentIndex === -1) return;
    
    const progress = ((currentIndex + 1) / steps.length) * 100;
    
    // Create or update progress bar
    let progressBar = document.getElementById('progressBar');
    let progressText = document.getElementById('progressText');
    
    if (!progressBar) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
            <div class="progress-bar">
                <div id="progressBar" class="progress-fill"></div>
            </div>
            <div id="progressText" class="progress-text"></div>
        `;
        
        // Insert at the top of the form container
        const formContainer = document.querySelector('.form-container');
        if (formContainer) {
            formContainer.insertBefore(progressContainer, formContainer.firstChild);
        }
        
        progressBar = document.getElementById('progressBar');
        progressText = document.getElementById('progressText');
    }
    
    if (progressBar && progressText) {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `Step ${currentIndex + 1} of ${steps.length}`;
    }
}

// Error boundary for async operations
export async function withErrorHandling(operation, errorMessage = 'An error occurred') {
    try {
        return await operation();
    } catch (error) {
        console.error(`${errorMessage}:`, error);
        showToast(errorMessage, 'error');
        throw error;
    }
}

// Retry utility for network operations
export async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(`Attempt ${attempt} failed:`, error);
            
            if (attempt < maxRetries) {
                showToast(`Operation failed, retrying... (${attempt}/${maxRetries})`, 'warning');
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }
    
    throw lastError;
}

// Form data serialization
export function serializeForm(formElement) {
    const formData = new FormData(formElement);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
        if (data[key]) {
            // Convert to array if multiple values
            if (!Array.isArray(data[key])) {
                data[key] = [data[key]];
            }
            data[key].push(value);
        } else {
            data[key] = value;
        }
    }
    
    return data;
}

// Local storage utilities for form persistence
export const storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn('Local storage set failed:', error);
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('Local storage get failed:', error);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('Local storage remove failed:', error);
        }
    },
    
    clear: () => {
        try {
            localStorage.clear();
        } catch (error) {
            console.warn('Local storage clear failed:', error);
        }
    }
};

// Auto-save form data
export function setupAutoSave(formElement, storageKey) {
    const inputs = formElement.querySelectorAll('input, select, textarea');
    
    const saveFormData = debounce(() => {
        const formData = serializeForm(formElement);
        storage.set(storageKey, formData);
    }, 1000);
    
    inputs.forEach(input => {
        input.addEventListener('input', saveFormData);
        input.addEventListener('change', saveFormData);
    });
    
    // Load saved data on page load
    const savedData = storage.get(storageKey);
    if (savedData) {
        Object.keys(savedData).forEach(key => {
            const element = formElement.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = savedData[key] === element.value;
                } else {
                    element.value = savedData[key];
                }
            }
        });
    }
    
    return {
        clear: () => storage.remove(storageKey),
        get: () => storage.get(storageKey)
    };
}

// Format currency for display
export function formatCurrency(amount, currency = 'ZAR') {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

// Format date for display
export function formatDate(date, locale = 'en-ZA') {
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(date));
}

// Generate unique ID
export function generateId(prefix = '') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check if running on mobile device
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Throttle function for performance
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Deep clone object
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

// Validate South African ID number (Luhn algorithm for demo)
export function validateSAID(idNumber) {
    if (!idNumber || idNumber.length !== 13) return false;
    
    // Basic structure validation (demo version)
    // In production, implement proper Luhn algorithm
    const idRegex = /^[0-9]{13}$/;
    return idRegex.test(idNumber);
}

// File size formatter
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Password strength checker (for future use)
export function checkPasswordStrength(password) {
    if (!password) return 0;
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    return strength;
}

// Email obfuscation for privacy
export function obfuscateEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    
    const obfuscatedLocal = local.length > 2 
        ? local.substring(0, 2) + '*'.repeat(local.length - 2)
        : '*'.repeat(local.length);
    
    return `${obfuscatedLocal}@${domain}`;
}

// Phone number formatting
export function formatPhoneNumber(phone) {
    if (!phone) return '';
    
    // South African phone number formatting
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('27') && cleaned.length === 11) {
        return `+${cleaned.substring(0, 2)} ${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
        return `+27 ${cleaned.substring(1, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
    }
    
    return phone;
}

// Check if online
export function isOnline() {
    return navigator.onLine;
}

// Offline handler
export function setupOfflineHandler() {
    window.addEventListener('online', () => {
        showToast('Connection restored', 'success');
    });
    
    window.addEventListener('offline', () => {
        showToast('You are currently offline', 'warning');
    });
}

// Performance measurement
export function measurePerformance(name, operation) {
    const start = performance.now();
    const result = operation();
    const end = performance.now();
    console.log(`${name} took ${(end - start).toFixed(2)}ms`);
    return result;
}

// Safe JSON parse
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (error) {
        console.warn('JSON parse error:', error);
        return defaultValue;
    }
}

// Array utilities
export const arrayUtils = {
    // Remove duplicates from array
    unique: (array) => [...new Set(array)],
    
    // Group array by key
    groupBy: (array, key) => {
        return array.reduce((groups, item) => {
            const group = item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    },
    
    // Sort array by key
    sortBy: (array, key, ascending = true) => {
        return array.sort((a, b) => {
            if (a[key] < b[key]) return ascending ? -1 : 1;
            if (a[key] > b[key]) return ascending ? 1 : -1;
            return 0;
        });
    }
};

// String utilities
export const stringUtils = {
    // Capitalize first letter
    capitalize: (str) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },
    
    // Convert to title case
    titleCase: (str) => {
        if (!str) return '';
        return str.replace(/\w\S*/g, (txt) => {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    },
    
    // Truncate string with ellipsis
    truncate: (str, length, ellipsis = '...') => {
        if (!str || str.length <= length) return str;
        return str.substring(0, length - ellipsis.length) + ellipsis;
    }
};
