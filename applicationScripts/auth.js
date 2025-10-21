import { showToast } from './utilities.js';

export function checkFirebaseInitialized() {
  try {
    return (
      window.firebaseAuth &&
      window.firebaseGoogleAuthProvider &&
      window.firebaseSignInWithPopup &&
      window.firebaseSignOut &&
      window.firebaseDb &&
      window.firebaseStorage &&
      window.firebaseRef &&
      window.firebaseCollection &&
      window.firebaseQuery &&
      window.firebaseWhere &&
      window.firebaseGetDocs &&
      window.firebaseSetDoc &&
      window.firebaseDoc &&
      window.firebaseGetDoc &&
      window.firebaseServerTimestamp &&
      window.firebaseUploadBytes &&
      window.firebaseGetDownloadURL
    );
  } catch (err) {
    console.error('Firebase initialization check failed:', err);
    showToast('Application error: Firebase services are unavailable. Please try again later.', 'error');
    return false;
  }
}

export async function signInWithGoogle() {
  if (!checkFirebaseInitialized()) return;
  try {
    const provider = new window.firebaseGoogleAuthProvider();
    await window.firebaseSignInWithPopup(window.firebaseAuth, provider);
  } catch (err) {
    console.error('Sign-in error:', err.code, err.message);
    const message = err.code === 'auth/popup-closed-by-user'
      ? 'Sign-in was cancelled. Please try again.'
      : `Sign-in failed: ${err.message}`;
    showToast(message, 'error');
  }
}

export async function doLogout() {
  if (!checkFirebaseInitialized()) return;
  try {
    await window.firebaseSignOut(window.firebaseAuth);
  } catch (err) {
    console.error('Sign-out error:', err);
    showToast(`Error signing out: ${err.message}`, 'error');
  }
}