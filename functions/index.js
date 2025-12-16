// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// 1. Store your Paystack Secret Key securely
// Run this command in terminal to set it: 
// firebase functions:config:set paystack.secret="sk_live_YOUR_ACTUAL_SECRET_KEY"
const PAYSTACK_SECRET_KEY = functions.config().paystack.secret;

exports.verifyPaystackPayment = functions.https.onCall(async (data, context) => {
    // Check if user is logged in
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated", 
            "The function must be called while authenticated."
        );
    }

    const reference = data.reference;
    if (!reference) {
        throw new functions.https.HttpsError("invalid-argument", "Payment reference is required.");
    }

    try {
        // 2. Call Paystack API to verify transaction
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
            }
        });

        const paymentData = response.data.data;

        // 3. Validate the payment status
        if (paymentData.status !== "success") {
            return { success: false, message: "Transaction was not successful" };
        }

        // 4. (Optional but Recommended) Verify Amount here
        // if (paymentData.amount < expectedAmount) { ... }

        // 5. Update Firestore securely from the backend
        // This prevents users from faking the update on the client side
        const userId = context.auth.uid;
        
        // Determine what was paid for based on metadata or reference
        // This logic mimics your client-side logic but does it securely
        const appRef = admin.firestore().collection("applications").doc(userId);
        
        // Example update (customize based on your exact needs)
        if (paymentData.metadata && paymentData.metadata.payment_type === 'application_fee') {
            await appRef.update({
                paymentStatus: 'application_paid',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else if (paymentData.metadata && paymentData.metadata.payment_type === 'subject_fees') {
             await appRef.update({
                paymentStatus: 'fully_paid',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        return { success: true, message: "Payment verified and recorded" };

    } catch (error) {
        console.error("Payment verification failed:", error.response ? error.response.data : error);
        throw new functions.https.HttpsError("internal", "Unable to verify payment");
    }
});