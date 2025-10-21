import { elements, subjects } from './constants.js';
import { updateProgressIndicator } from './utilities.js';

export function showSection(section) {
  // Safely handle all elements with null checks
  if (elements.applicationSection) {
    elements.applicationSection.style.display = section === 'application' ? 'block' : 'none';
  }
  
  if (elements.consentSection) {
    elements.consentSection.style.display = section === 'consent' ? 'block' : 'none';
  }
  
  if (elements.rulesSection) {
    elements.rulesSection.style.display = section === 'rules' ? 'block' : 'none';
  }
  
  if (elements.pledgeSection) {
    elements.pledgeSection.style.display = section === 'pledge' ? 'block' : 'none';
  }
  
  if (elements.applicationStatus) {
    elements.applicationStatus.style.display = section === 'status' ? 'block' : 'none';
  }
  
  if (elements.existingApplication) {
    elements.existingApplication.style.display = section === 'existing' ? 'block' : 'none';
  }
  
  if (elements.dashboardSection) {
    elements.dashboardSection.style.display = section === 'dashboard' ? 'block' : 'none';
  }
  
  if (elements.startApplicationBtn) {
    elements.startApplicationBtn.style.display = section === 'application' ? 'inline-flex' : 'none';
  }
  
  // Update progress indicator when section changes
  updateProgressIndicator(section);
}

export function updateSubjects(grade) {
  if (!elements.subjectsContainer) return;
  
  const selected = Array.from(document.querySelectorAll('input[name="subjects"]:checked')).map(cb => cb.value);
  elements.subjectsContainer.innerHTML = '';
  if (!grade) return;
  const fragment = document.createDocumentFragment();
  let gradeCategory = (parseInt(grade) <= 9) ? '8-9' : '10-12';
  subjects[gradeCategory].forEach(subject => {
    const div = document.createElement('div');
    div.className = 'subject-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'subjects';
    input.value = subject;
    input.id = `sub-${subject.replace(/\s+/g, '-')}`;
    if (selected.includes(subject)) input.checked = true;
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = subject;
    div.appendChild(input);
    div.appendChild(label);
    fragment.appendChild(div);
  });
  elements.subjectsContainer.appendChild(fragment);
}

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
    element.style.display = 'block';
    
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
        element.style.opacity = '1';
      }
    }
    
    window.requestAnimationFrame(step);
  }
}

export function scrollToElement(element, behavior = 'smooth') {
  if (element) {
    element.scrollIntoView({
      behavior: behavior,
      block: 'start'
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
    modal.style.display = 'flex';
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

export function setupModalClose(modalId, closeSelectors = ['.close', '.cancel-btn']) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const closeModal = () => hideModal(modalId);

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close on close button clicks
  closeSelectors.forEach(selector => {
    const closeElements = modal.querySelectorAll(selector);
    closeElements.forEach(element => {
      element.addEventListener('click', closeModal);
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
    }
  });
}

export function updateButtonState(button, isLoading, loadingText = 'Loading...') {
  if (button) {
    if (isLoading) {
      button.disabled = true;
      button.setAttribute('data-original-text', button.textContent);
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
    } else {
      button.disabled = false;
      const originalText = button.getAttribute('data-original-text');
      if (originalText) {
        button.textContent = originalText;
        button.removeAttribute('data-original-text');
      }
    }
  }
}

export function createNotification(message, type = 'info', duration = 5000) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas fa-${getNotificationIcon(type)}"></i>
      <span>${message}</span>
      <button class="notification-close" aria-label="Close notification">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  const container = document.getElementById('notificationContainer') || createNotificationContainer();
  container.appendChild(notification);

  // Add show class after a delay for animation
  setTimeout(() => notification.classList.add('show'), 10);

  // Close button
  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.addEventListener('click', () => removeNotification(notification));

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      if (notification.parentNode) {
        removeNotification(notification);
      }
    }, duration);
  }

  return notification;
}

function getNotificationIcon(type) {
  const icons = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };
  return icons[type] || 'info-circle';
}

function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notificationContainer';
  container.className = 'notification-container';
  document.body.appendChild(container);
  return container;
}

function removeNotification(notification) {
  notification.classList.remove('show');
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

export function formatCurrency(amount, currency = 'ZAR', locale = 'en-ZA') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount);
}

export function formatDate(date, locale = 'en-ZA') {
  if (!date) return '';
  const dateObj = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(dateObj);
}

export function formatDateTime(date, locale = 'en-ZA') {
  if (!date) return '';
  const dateObj = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
}

export function truncateText(text, maxLength, ellipsis = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

export function capitalizeWords(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export function sanitizeForId(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}