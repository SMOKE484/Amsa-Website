// Import the Firebase app and messaging modules (use compat versions for service workers)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// --- Firebase Configuration ---
// Ensure this matches your project configuration in applications.html
const firebaseConfig = {
    apiKey: "AIzaSyBqXXAo4PCH_fv4_dciua9J-fUQeOzxi7w",
    authDomain: "amsa-website-3b9d5.firebaseapp.com",
    projectId: "amsa-website-3b9d5",
    storageBucket: "amsa-website-3b9d5.firebasestorage.app",
    messagingSenderId: "843868533888",
    appId: "1:843868533888:web:a681f7c4bca393a535a265",
    // measurementId is not typically needed in the service worker
};

// --- Initialize Firebase ---
// Check if Firebase is already initialized to avoid errors on reload
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); // if already initialized, use that instance
}

// --- Get Firebase Messaging instance ---
const messaging = firebase.messaging();

// --- Background Message Handler ---
// This function runs when the browser receives a push notification
// and the website tab is NOT currently open/active.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  // Extract notification details from the payload sent by your Cloud Function
  const notificationTitle = payload.notification?.title || 'Alusani Academy Reminder';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message.',
    icon: payload.notification?.icon || '/images/amsaLogo.png', // Path to your logo (relative to origin)
    // Optional: Add a 'tag' to make notifications overwrite each other if needed
    // tag: 'payment-reminder',
    // Optional: Add 'data' to pass information to the page when clicked (if needed)
    data: {
      click_action: payload.fcmOptions?.link || '/' // Get the link from fcmOptions if provided
    }
  };

  // Display the notification using the browser's Notification API
  // `self.registration` refers to the service worker's registration
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- Optional: Notification Click Handler ---
// This handles what happens when the user clicks the displayed notification.
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);

  event.notification.close(); // Close the notification

  // Get the URL to open from the notification's data (set in onBackgroundMessage)
  const urlToOpen = event.notification.data?.click_action || '/'; // Default to homepage

  // Try to focus an existing tab/window or open a new one
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true // Important for matching existing windows
    }).then((clientList) => {
      // Check if a window/tab with the same URL is already open
      for (const client of clientList) {
        // Use endsWith to handle potential query parameters or hashes
        if (client.url.endsWith(urlToOpen) && 'focus' in client) {
          return client.focus(); // Focus the existing window/tab
        }
      }
      // If no matching window/tab is found, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

console.log('[firebase-messaging-sw.js] Service worker script loaded and running.');