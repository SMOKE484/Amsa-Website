const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

const paystackSecret = defineSecret("PAYSTACK_SECRET");

// Shared month-key format: must match client-side toLocaleString('en-US', {month:'long',year:'numeric'})
// "July 2025" → "july_2025"
function getMonthKey(date) {
    return date.toLocaleString("en-US", { month: "long", year: "numeric" })
        .toLowerCase().replace(/ /g, "_");
}

function getScheduledMonthKeys(paymentStartDate, paymentPlan) {
    const count = paymentPlan === "sixMonths" ? 6 : 10;
    const start = new Date(paymentStartDate);
    const keys = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        keys.push(getMonthKey(d));
    }
    return keys;
}

exports.verifyPaystackPayment = onCall(
    { secrets: [paystackSecret], cors: true, invoker: "public" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
        }

        const reference = request.data.reference;
        if (!reference || typeof reference !== "string") {
            throw new HttpsError("invalid-argument", "Payment reference is required.");
        }

        const userId = request.auth.uid;
        const db = admin.firestore();

        // Idempotency: return early if this reference was already successfully processed
        const verificationRef = db.collection("payment_verifications").doc(reference);
        const existingVerification = await verificationRef.get();
        if (existingVerification.exists()) {
            console.log(`Reference ${reference} already verified — returning cached result`);
            return { success: true, message: "Payment already verified and recorded", cached: true };
        }

        try {
            const response = await axios.get(
                `https://api.paystack.co/transaction/verify/${reference}`,
                { headers: { Authorization: `Bearer ${paystackSecret.value().trim()}` } }
            );

            const paymentData = response.data.data;

            if (paymentData.status !== "success") {
                return { success: false, message: "Transaction was not successful" };
            }

            const metadata = paymentData.metadata || {};
            const allowedPaymentTypes = ["application_fee", "subject_fees", "tuition_fees"];

            // Verify the payment belongs to the authenticated user
            if (metadata.application_id && metadata.application_id !== userId) {
                throw new HttpsError("permission-denied", "Payment reference does not belong to this account.");
            }

            const appRef = db.collection("applications").doc(userId);

            let allPaid = false;

            if (metadata.payment_type === "application_fee") {
                await appRef.update({
                    paymentStatus: "application_paid",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else if (metadata.payment_type === "subject_fees") {
                await appRef.update({
                    paymentStatus: "fully_paid",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else if (metadata.payment_type === "tuition_fees") {
                const paymentMonth = metadata.payment_month;
                const paymentPlan = metadata.payment_plan;

                // 'first_payment' means the plan is being activated — client handles this via
                // updateApplicationWithPaymentPlan; no monthly record to write here
                if (paymentMonth && paymentMonth !== "first_payment" && paymentPlan) {
                    const monthKey = paymentMonth.trim().toLowerCase().replace(/ /g, "_");

                    allPaid = await db.runTransaction(async (transaction) => {
                        const docSnap = await transaction.get(appRef);
                        const data = docSnap.exists() ? docSnap.data() : {};
                        const payments = { ...(data.payments || {}) };

                        payments[monthKey] = {
                            amount: paymentData.amount / 100,
                            paid: true,
                            paidAt: new Date().toISOString(),
                            reference: reference
                        };

                        const startDate = data.paymentStartDate
                            ? new Date(data.paymentStartDate)
                            : new Date();
                        const scheduledKeys = getScheduledMonthKeys(startDate, paymentPlan);
                        const completed = scheduledKeys.every(k => payments[k]?.paid === true);

                        const updateData = {
                            [`payments.${monthKey}`]: payments[monthKey],
                            lastPaymentDate: payments[monthKey].paidAt,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        };
                        if (completed) updateData.paymentStatus = "fully_paid";

                        transaction.update(appRef, updateData);
                        return completed;
                    });
                }
            }

            // Record successful verification for idempotency
            await verificationRef.set({
                reference,
                userId,
                paymentType: metadata.payment_type || null,
                amount: paymentData.amount,
                verifiedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, message: "Payment verified and recorded", allPaid };

        } catch (error) {
            if (error instanceof HttpsError) throw error;

            const errorDetails = error.response ? error.response.data : error.message;
            console.error("Payment verification failed:", errorDetails);

            // Log failed verification attempt for admin auditing
            try {
                await db.collection("payment_errors").doc(reference).set({
                    reference,
                    userId,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    errorMessage: error.message,
                    statusCode: error.response?.status || null,
                    errorDetails: errorDetails
                }, { merge: true });
            } catch (logErr) {
                console.error("Failed to log payment error:", logErr.message);
            }

            throw new HttpsError("internal", "Unable to verify payment");
        }
    }
);

exports.sendMonthlyPaymentReminders = onSchedule(
    { schedule: "0 8 1 * *", timeZone: "Africa/Johannesburg" },
    async () => {
        const now = new Date();
        const currentMonthDisplay = now.toLocaleString("en-ZA", { month: "long", year: "numeric" });
        const currentMonthKey = getMonthKey(now);

        const snap = await admin.firestore().collection("applications")
            .where("paymentStatus", "==", "application_paid")
            .where("paymentPlan", "in", ["sixMonths", "tenMonths"])
            .get();

        let sent = 0, skipped = 0;

        for (const doc of snap.docs) {
            try {
                const student = doc.data();

                if (!student.pushTokens || student.pushTokens.length === 0) { skipped++; continue; }

                if (!student.paymentStartDate) { skipped++; continue; }
                const schedule = getScheduledMonthKeys(student.paymentStartDate, student.paymentPlan);
                if (!schedule.includes(currentMonthKey)) { skipped++; continue; }

                if (student.payments && student.payments[currentMonthKey]?.paid === true) { skipped++; continue; }

                const planMonths = student.paymentPlan === "sixMonths" ? 6 : 10;
                const monthlyAmount = student.tuitionAmount
                    ? `R${(student.tuitionAmount / planMonths).toFixed(2)}`
                    : "your monthly installment";

                const result = await admin.messaging().sendEachForMulticast({
                    tokens: student.pushTokens,
                    notification: {
                        title: "Tuition Payment Due",
                        body: `Hi ${student.firstName || "there"}, your ${currentMonthDisplay} installment of ${monthlyAmount} is due today.`
                    },
                    webpush: {
                        fcmOptions: { link: "/pages/applications.html" }
                    }
                });

                sent++;
                console.log(`Notified ${student.firstName} (${doc.id}) — ${result.successCount} sent, ${result.failureCount} failed`);

            } catch (err) {
                console.error(`Reminder failed for doc ${doc.id}:`, err.message);
            }
        }

        console.log(`Monthly reminder complete — ${sent} notified, ${skipped} skipped`);
    }
);
