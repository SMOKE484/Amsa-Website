// applicationScripts/storage.js

import { showToast, validateFile } from './utilities.js';

// ==========================================
// CONFIGURATION
// ==========================================
const CLOUD_NAME = "dktd1kpgd"; 
const UPLOAD_PRESET = "AMSA presest"; 
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
// ==========================================

export async function uploadFile(file, fileType) {
  if (!file) throw new Error('No file provided for upload');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', 'AMSA_APPLICATIONS'); 
  formData.append('tags', fileType); 

  try {
    console.log(`Starting upload for ${fileType}...`);
    
    // *** FIX: INCREASED TIMEOUT TO 90 SECONDS ***
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90,000ms = 90 seconds

    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal 
    });

    clearTimeout(timeoutId); // Clear timeout if successful

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Upload failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Upload successful (${fileType}):`, data.secure_url);
    
    return data.secure_url;

  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    
    if (error.name === 'AbortError') {
        // If it times out even after 90 seconds
        throw new Error("Upload timed out (90s limit). Your internet may be too slow for this file.");
    }
    throw new Error(`Failed to upload ${fileType}: ${error.message}`);
  }
}

/**
 * Handles the file input change event.
 * UPDATES THE UI BOXES
 */
export function handleFileUpload(e, fileType) {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    const acceptedTypes = fileType === 'reportCard' 
      ? ['application/pdf'] 
      : ['application/pdf', 'image/jpeg', 'image/png'];
      
    if (!validateFile(file, acceptedTypes, 5 * 1024 * 1024)) {
        e.target.value = '';
        return;
    }

    const uploadBox = document.getElementById(`${fileType}Upload`);
    
    if (uploadBox) {
        uploadBox.style.borderColor = '#44c0b6'; 
        uploadBox.style.borderStyle = 'solid';
        uploadBox.style.backgroundColor = 'rgba(68, 192, 182, 0.05)'; 

        const icon = uploadBox.querySelector('i'); 
        const text = uploadBox.querySelector('p'); 

        if (icon) {
            icon.className = 'fas fa-check-circle';
            icon.style.color = '#44c0b6';
            icon.style.fontSize = '2rem';
        }

        if (text) {
            text.textContent = file.name;
            text.style.color = '#2e5c89';
            text.style.fontWeight = 'bold';
        }
    }

    const statusText = document.getElementById(`${fileType}Name`); 
    if (statusText) {
        statusText.innerHTML = ''; 
    }
  }
}

export function handleFileDrop(e, uploadArea) {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  
  if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isReport = uploadArea.id.includes('report');
      const fileType = isReport ? 'reportCard' : 'idDocument';
      const inputId = isReport ? 'reportCard' : 'idDocument';
      
      const fileInput = document.getElementById(inputId);
      
      const fakeEvent = {
          target: { files: [file], value: 'fake-path' }
      };
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      
      handleFileUpload(fakeEvent, fileType);
  }
}