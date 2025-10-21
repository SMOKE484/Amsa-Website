import { elements } from './constants.js';
import { validateFile, showToast } from './utilities.js';

export async function uploadFile(file, fileType) {
  if (!file) {
    throw new Error('No file provided for upload');
  }
  
  const user = window.firebaseAuth.currentUser;
  if (!user || !user.uid) {
    throw new Error('User not authenticated');
  }
  
  const fileExtension = file.name.split('.').pop();
  const fileRef = window.firebaseRef(window.firebaseStorage, `applications/${user.uid}/${fileType}_${Date.now()}.${fileExtension}`);
  
  try {
    await window.firebaseUploadBytes(fileRef, file);
    const downloadUrl = await window.firebaseGetDownloadURL(fileRef);
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload ${fileType}: ${error.message}`);
  }
}

export function handleFileUpload(e, fileType) {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    const acceptedTypes = fileType === 'reportCard' ? ['application/pdf'] : ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validateFile(file, acceptedTypes, 5 * 1024 * 1024)) return;
    const targetName = fileType === 'reportCard' ? elements.reportCardName : elements.idDocumentName;
    targetName.textContent = `Selected file: ${file.name}`;
  }
}

export function handleFileDrop(e, uploadArea) {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  const targetInput = uploadArea.id === 'reportCardUpload' ? elements.reportCard : elements.idDocument;
  const targetName = uploadArea.id === 'reportCardUpload' ? elements.reportCardName : elements.idDocumentName;
  const acceptedTypes = uploadArea.id === 'reportCardUpload'
    ? ['application/pdf']
    : ['application/pdf', 'image/jpeg', 'image/png'];
  if (file && validateFile(file, acceptedTypes, 5 * 1024 * 1024)) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    targetInput.files = dataTransfer.files;
    targetName.textContent = `Selected file: ${file.name}`;
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
}