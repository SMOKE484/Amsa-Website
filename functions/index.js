// index.js (Using v2 SDK syntax for scheduled functions)

// Import v2 scheduler and logger
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger"); // Use the v2 logger

const admin = require("firebase-admin");

// Initialize Firebase Admin SDK (only once)
admin.initializeApp();

// Get Firestore and Messaging instances
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Sends a web push notification reminder to students with pending monthly payments.
 * Runs at 9:00 AM on the 1st day of every month, according to South Africa Standard Time.
 */
exports.monthlyPaymentReminderPush = onSchedule(
    {
        schedule: "0 9 1 * *", // Cron syntax: minute(0), hour(9), day-of-month(1), month(* = every), day-of-week(* = every)
        timeZone: "Africa/Johannesburg", // Set to South Africa timezone (SAST)
        // You can add other options like memory, timeoutSeconds etc. here if needed
        // memory: "512MiB",
        // timeoutSeconds: 300,
    },
    async (event) => { // The event object is passed to the handler in v2

        logger.info("Starting: Running monthly payment reminder PUSH job..."); // Use v2 logger

        const today = new Date();
        // Ensure month name is derived correctly for the target timezone
        const monthName = today.toLocaleString('en-US', { month: 'long', timeZone: 'Africa/Johannesburg' }).toLowerCase();
        const year = today.getFullYear();
        // Construct the key used in Firestore (e.g., "october_2025")
        const currentMonthKey = `${monthName}_${year}`;

        logger.info(`Checking for pending payments for: ${currentMonthKey}`);

        try {
            // Query Firestore for applications that meet the criteria:
            // 1. Status is 'approved'
            // 2. Payment plan is 'sixMonths' or 'tenMonths'
            const querySnapshot = await db.collection('applications')
                .where('status', '==', 'approved')
                .where('paymentPlan', 'in', ['sixMonths', 'tenMonths'])
                .get();

            if (querySnapshot.empty) {
                logger.info("Result: No approved applications on installment plans found. Job finished.");
                return null; // Exit successfully if no relevant applications
            }

            logger.info(`Found ${querySnapshot.size} potential applications to check.`);

            let remindersSentCount = 0;
            const notificationPromises = []; // Array to hold all messaging promises
            const cleanupPromises = []; // Array to hold promises for token cleanup

            // Loop through each relevant application
            querySnapshot.forEach(doc => {
                const app = doc.data();
                const userId = doc.id;

                // Safely access nested payment data for the current month
                const paymentData = app.payments ? app.payments[currentMonthKey] : null;

                // Determine if a reminder is needed:
                const needsReminder = !paymentData || paymentData.paid !== true;

                if (needsReminder) {
                    // Check if the application document has push notification tokens stored
                    if (app.pushTokens && Array.isArray(app.pushTokens) && app.pushTokens.length > 0) {

                        // Construct the notification message payload
                        const messagePayload = {
                            notification: {
                                title: "Alusani Academy Payment Reminder",
                                body: `Hi ${app.firstName || 'Student'}, your tuition payment for ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} is due soon. Please log in to your portal to complete the payment.`,
                                icon: "https://amsa-website-3b9d5.firebaseapp.com/images/amsaLogo.png" // Optional: URL to your logo
                            },
                            webpush: { // Web Push specific configuration
                                fcmOptions: {
                                    // URL to open when the user clicks the notification
                                    link: "https://amsa-website-3b9d5.firebaseapp.com/applications.html#payments" // Direct link to payments tab in student portal
                                }
                            },
                            tokens: app.pushTokens // Array of FCM tokens for this user's devices/browsers
                        };

                        logger.info(`Action: Preparing notification for user ${userId} (${app.firstName}) for month ${currentMonthKey}`);

                        // Add the promise to send the message to the array
                        notificationPromises.push(
                            messaging.sendMulticast(messagePayload)
                                .then((response) => {
                                    remindersSentCount += response.successCount;
                                    logger.log(`User ${userId}: Successfully sent ${response.successCount} notifications.`); // Use logger.log for general info

                                    // Check for failures and identify tokens to remove
                                    if (response.failureCount > 0) {
                                        logger.warn(`User ${userId}: Failed to send notification to ${response.failureCount} tokens.`); // Use logger.warn
                                        const tokensToRemove = [];
                                        response.responses.forEach((resp, idx) => {
                                            if (!resp.success) {
                                                const failedToken = app.pushTokens[idx];
                                                // Log the specific error for the failed token
                                                logger.error(`  - Token[${idx}]: ${failedToken}, Error: ${resp.error.message} (Code: ${resp.error.code})`); // Use logger.error

                                                // Check if the error indicates the token is invalid or unregistered
                                                if (resp.error.code === 'messaging/registration-token-not-registered' ||
                                                    resp.error.code === 'messaging/invalid-registration-token') {
                                                    tokensToRemove.push(failedToken);
                                                    logger.info(`  - Marked token for removal: ${failedToken}`);
                                                }
                                            }
                                        });

                                        // If there are tokens to remove, add a cleanup task
                                        if (tokensToRemove.length > 0) {
                                            const userRef = db.collection('applications').doc(userId);
                                            logger.info(`Action: Scheduling removal of ${tokensToRemove.length} invalid tokens for user ${userId}.`);
                                            // Add the update promise to the cleanupPromises array
                                            cleanupPromises.push(
                                                userRef.update({
                                                    // Use arrayRemove with the spread operator to handle multiple tokens
                                                    pushTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
                                                }).catch(cleanupError => {
                                                    logger.error(`Error removing tokens for user ${userId}:`, cleanupError);
                                                })
                                            );
                                        }
                                    }
                                })
                                .catch(error => {
                                     logger.error(`Error sending notification multicast to user ${userId}:`, error);
                                })
                        );
                    } else {
                         logger.info(`Info: User ${userId} (${app.firstName}) needs reminder for ${currentMonthKey} but has no registered push tokens.`);
                    }
                } else {
                     logger.info(`Info: User ${userId} (${app.firstName}) has already paid for ${currentMonthKey}. No reminder needed.`);
                }
            });

            // Wait for all the notification sending promises to complete
            await Promise.all(notificationPromises);
            logger.info(`Result: Finished sending notifications. Total successful sends: ${remindersSentCount}.`);

            // Wait for all token cleanup promises to complete
            if (cleanupPromises.length > 0) {
                logger.info(`Action: Waiting for ${cleanupPromises.length} token cleanup operations to complete...`);
                await Promise.all(cleanupPromises);
                logger.info("Result: Token cleanup operations finished.");
            }

        } catch (error) {
            // Log any errors during the function execution using the v2 logger
            logger.error("Error executing monthlyPaymentReminderPush function:", error);
        }

        logger.info("Finished: Monthly payment reminder PUSH job completed.");
        return null; // Indicate successful completion
    }); // End of onSchedule

// You can add other Cloud Functions below this line if needed