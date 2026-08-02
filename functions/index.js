const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

admin.initializeApp();

const paystackSecret = defineSecret("PAYSTACK_SECRET");

// Kept as a second, small copy rather than importing applicationScripts/utilities.js:
// that module is browser-only (no build step shares code between client and functions/).
// Keep these in sync with validateEmail/validatePhone in applicationScripts/utilities.js.
function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
function isValidPhone(phone) {
    if (!phone) return false;
    return /^(\+27|0)[6-8][0-9]{8}$/.test(phone.replace(/\s+/g, ""));
}

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
        if (existingVerification.exists) {
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
                        const data = docSnap.exists ? docSnap.data() : {};
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

// ---------------------------------------------------------------------------
// Trip consent/indemnity form
// ---------------------------------------------------------------------------
// NOTE: this waiver/POPIA wording is placeholder copy, not legal advice.
// Have it reviewed by the Academy's insurer/legal advisor before relying on
// it for a real trip. It must stay byte-for-byte identical to the copy shown
// to signees in tripScripts/constants.js — there is no shared module
// between functions/ and the browser, so both copies are updated by hand.
const TRIP_WAIVER_TEXT = "I, the undersigned, confirm that I am voluntarily participating in the " +
    "above-named trip organised by Alusani Maths and Science Academy (\"the Academy\"). I acknowledge that " +
    "travel and group activities carry inherent risks, including but not limited to accident, injury, illness, " +
    "loss of or damage to personal property, and travel delays. I release and hold harmless the Academy, its " +
    "staff, and its agents from any claim, liability, loss, or expense arising from my participation in this " +
    "trip, except where caused by the Academy's gross negligence or wilful misconduct. I confirm that the " +
    "medical and emergency contact information I have provided is accurate and complete to the best of my " +
    "knowledge, and I authorise the Academy to seek emergency medical treatment on my behalf if I am unable to " +
    "consent at the time. I understand that any payment made for this trip is non-refundable, and that the " +
    "Academy is under no obligation to grant a refund. The Academy may, entirely at its own discretion, choose " +
    "to make an exception and refund some or all of the payment, but is not required to do so. I understand " +
    "that this form, once signed, will be retained by the Academy as a record of my consent for this trip.";

const TRIP_POPIA_TEXT = "I consent to Alusani Maths and Science Academy collecting, storing, and " +
    "processing the personal information (including medical information) I have provided on this form, solely " +
    "for the purpose of organising and ensuring my safety during this trip, in accordance with the Protection " +
    "of Personal Information Act (POPIA).";

// Mirrors the isAdminUser() helper in firestore.rules — same three checks
// (admins/{uid} doc exists, or hardcoded owner email, or academy domain).
async function isAdminAuth(authContext) {
    if (!authContext) return false;
    const email = authContext.token && authContext.token.email;
    if (email === "vhulendamashamba4@gmail.com") return true;
    if (typeof email === "string" && /@alusaniacademy\.edu\.za$/.test(email)) return true;
    const snap = await admin.firestore().collection("admins").doc(authContext.uid).get();
    return snap.exists;
}

function wrapPdfText(text, font, size, maxWidth) {
    const lines = [];
    for (const paragraph of text.split("\n")) {
        const words = paragraph.split(" ");
        let current = "";
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        lines.push(current);
    }
    return lines;
}

class TripPdfCursor {
    constructor(pdfDoc, font, boldFont) {
        this.pdfDoc = pdfDoc;
        this.font = font;
        this.boldFont = boldFont;
        this.margin = 50;
        this.pageWidth = 595.28; // A4
        this.pageHeight = 841.89;
        this.page = pdfDoc.addPage([this.pageWidth, this.pageHeight]);
        this.y = this.pageHeight - this.margin;
    }
    ensureSpace(height) {
        if (this.y - height < this.margin) {
            this.page = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            this.y = this.pageHeight - this.margin;
        }
    }
    heading(text, size = 13) {
        this.ensureSpace(size + 10);
        this.page.drawText(text, { x: this.margin, y: this.y, size, font: this.boldFont, color: rgb(0, 0, 0) });
        this.y -= size + 8;
    }
    line(text, size = 11) {
        this.ensureSpace(size + 4);
        this.page.drawText(text, { x: this.margin, y: this.y, size, font: this.font, color: rgb(0, 0, 0) });
        this.y -= size + 6;
    }
    wrapped(text, size = 10) {
        const maxWidth = this.pageWidth - this.margin * 2;
        for (const l of wrapPdfText(text, this.font, size, maxWidth)) {
            this.ensureSpace(size + 4);
            this.page.drawText(l, { x: this.margin, y: this.y, size, font: this.font, color: rgb(0, 0, 0) });
            this.y -= size + 4;
        }
    }
    spacer(h = 10) {
        this.y -= h;
    }
}

async function generateTripPdf(data) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const cursor = new TripPdfCursor(pdfDoc, font, boldFont);

    cursor.heading("Alusani Maths and Science Academy", 16);
    cursor.heading("Trip Consent & Indemnity Form", 13);
    cursor.spacer(6);
    cursor.line(`Trip: ${data.tripName}`);
    cursor.line(`Trip Date: ${data.tripDate}`);
    cursor.spacer(10);

    cursor.heading("Signee Information");
    cursor.line(`Full Name: ${data.fullName}`);
    cursor.line(`Email: ${data.email}`);
    cursor.line(`Phone: ${data.phone}`);
    cursor.spacer(10);

    cursor.heading("Emergency Contact");
    cursor.line(`Name: ${data.emergencyContactName}`);
    cursor.line(`Phone: ${data.emergencyContactPhone}`);
    cursor.line(`Relationship: ${data.emergencyContactRelationship}`);
    cursor.spacer(10);

    cursor.heading("Medical Information");
    cursor.line(`Medical Conditions: ${data.medicalConditions || "None provided"}`);
    cursor.line(`Allergies: ${data.allergies || "None provided"}`);
    cursor.line(`Medical Aid Details: ${data.medicalAidDetails || "None provided"}`);
    cursor.spacer(10);

    cursor.heading("Indemnity & Consent Waiver");
    cursor.wrapped(TRIP_WAIVER_TEXT);
    cursor.spacer(6);
    cursor.line("[X] I confirm that I have read and agree to the waiver above.");
    cursor.spacer(10);

    cursor.heading("POPIA Consent");
    cursor.wrapped(TRIP_POPIA_TEXT);
    cursor.spacer(6);
    cursor.line("[X] I consent to the processing of my personal information as described above.");
    cursor.spacer(16);

    const signatureBytes = Buffer.from(data.signatureBase64, "base64");
    const pngImage = await pdfDoc.embedPng(signatureBytes);
    const maxSigWidth = 250;
    const scale = Math.min(1, maxSigWidth / pngImage.width);
    const sigWidth = pngImage.width * scale;
    const sigHeight = pngImage.height * scale;

    cursor.ensureSpace(sigHeight + 50);
    cursor.heading("Signature");
    cursor.page.drawImage(pngImage, { x: cursor.margin, y: cursor.y - sigHeight, width: sigWidth, height: sigHeight });
    cursor.y -= sigHeight + 6;
    cursor.line(`Signed by ${data.fullName} on ${data.signedDateDisplay}`);
    cursor.spacer(20);

    cursor.line(`Submission ID: ${data.submissionId}`, 8);
    cursor.line(`Generated: ${new Date().toISOString()}`, 8);

    return pdfDoc.save();
}

exports.submitTripForm = onCall(
    { cors: true, invoker: "public" },
    async (request) => {
        const data = request.data || {};

        // Honeypot: real users never see or fill this field. A non-empty value
        // means a bot filled every input blindly. Silently no-op rather than
        // erroring, so scripts don't learn they were caught.
        if (data.honeypot) {
            return { success: true };
        }

        const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
        const email = typeof data.email === "string" ? data.email.trim() : "";
        const phone = typeof data.phone === "string" ? data.phone.trim() : "";
        const emergencyContactName = typeof data.emergencyContactName === "string" ? data.emergencyContactName.trim() : "";
        const emergencyContactPhone = typeof data.emergencyContactPhone === "string" ? data.emergencyContactPhone.trim() : "";
        const emergencyContactRelationship = typeof data.emergencyContactRelationship === "string" ?
            data.emergencyContactRelationship.trim() : "";
        const medicalConditions = typeof data.medicalConditions === "string" ? data.medicalConditions.trim() : "";
        const allergies = typeof data.allergies === "string" ? data.allergies.trim() : "";
        const medicalAidDetails = typeof data.medicalAidDetails === "string" ? data.medicalAidDetails.trim() : "";
        const tripId = typeof data.tripId === "string" ? data.tripId.trim() : "";
        const signatureDataUrl = typeof data.signatureDataUrl === "string" ? data.signatureDataUrl : "";

        const requiredShortFields = { fullName, emergencyContactName, emergencyContactRelationship };
        for (const [key, value] of Object.entries(requiredShortFields)) {
            if (!value || value.length > 200) {
                throw new HttpsError("invalid-argument", `${key} is required and must be under 200 characters.`);
            }
        }
        const longFields = { medicalConditions, allergies, medicalAidDetails };
        for (const [key, value] of Object.entries(longFields)) {
            if (value.length > 2000) {
                throw new HttpsError("invalid-argument", `${key} must be under 2000 characters.`);
            }
        }
        if (!tripId) {
            throw new HttpsError("invalid-argument", "A trip must be selected.");
        }
        if (!isValidEmail(email)) {
            throw new HttpsError("invalid-argument", "A valid email address is required.");
        }
        if (!isValidPhone(phone)) {
            throw new HttpsError("invalid-argument", "A valid South African phone number is required.");
        }
        if (!isValidPhone(emergencyContactPhone)) {
            throw new HttpsError("invalid-argument", "A valid emergency contact phone number is required.");
        }
        if (data.waiverAgreed !== true) {
            throw new HttpsError("invalid-argument", "You must agree to the waiver to submit this form.");
        }
        if (data.popiaConsent !== true) {
            throw new HttpsError("invalid-argument", "You must consent to the processing of your personal information.");
        }
        if (!/^data:image\/png;base64,/.test(signatureDataUrl)) {
            throw new HttpsError("invalid-argument", "A signature is required.");
        }
        const signatureBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
        const signatureBytes = Buffer.from(signatureBase64, "base64");
        if (signatureBytes.length < 100 || signatureBytes.length > 2 * 1024 * 1024) {
            throw new HttpsError("invalid-argument", "Signature image is invalid.");
        }

        const db = admin.firestore();

        const tripSnap = await db.collection("trips").doc(tripId).get();
        if (!tripSnap.exists || tripSnap.data().active !== true) {
            throw new HttpsError("failed-precondition", "This trip is not currently accepting sign-ups.");
        }
        const trip = tripSnap.data();

        // Idempotency: one submission per (trip, email). Checked before any
        // PDF generation/upload/write so a double-click or client retry can't
        // produce two PDFs for the same person+trip.
        const dedupeKey = crypto.createHash("sha256").update(`${tripId}|${email.toLowerCase()}`).digest("hex");
        const lockRef = db.collection("trip_submission_locks").doc(dedupeKey);
        const lockSnap = await lockRef.get();
        if (lockSnap.exists) {
            return {
                success: true,
                duplicate: true,
                message: "You've already submitted a consent form for this trip."
            };
        }

        const submissionRef = db.collection("tripSubmissions").doc();

        try {
            const signedDateDisplay = new Date().toLocaleDateString("en-ZA", {
                year: "numeric", month: "long", day: "numeric"
            });

            const pdfBytes = await generateTripPdf({
                tripName: trip.name,
                tripDate: trip.tripDate,
                fullName, email, phone,
                emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
                medicalConditions, allergies, medicalAidDetails,
                signatureBase64,
                signedDateDisplay,
                submissionId: submissionRef.id
            });

            const pdfStoragePath = `trip-pdfs/${tripId}/${submissionRef.id}.pdf`;
            await admin.storage().bucket().file(pdfStoragePath).save(Buffer.from(pdfBytes), {
                contentType: "application/pdf",
                metadata: {
                    contentDisposition: `attachment; filename="trip-consent-${submissionRef.id}.pdf"`
                }
            });

            // Plain .set() without merge is correct here: submissionRef is a
            // brand-new auto-ID doc created exactly once by this function, not
            // an existing doc updated across multiple lifecycle phases (unlike
            // applications/{uid}, which genuinely needs merge:true — don't
            // "fix" this into a merge by pattern-matching that collection).
            await submissionRef.set({
                tripId,
                tripName: trip.name,
                fullName, email, phone,
                emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
                medicalConditions, allergies, medicalAidDetails,
                waiverAgreed: true,
                popiaConsent: true,
                pdfStoragePath,
                dedupeKey,
                source: "public_form",
                signedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await lockRef.set({
                tripId,
                email,
                submissionId: submissionRef.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, submissionId: submissionRef.id };

        } catch (error) {
            if (error instanceof HttpsError) throw error;

            console.error("Trip submission failed:", error.message);
            try {
                await db.collection("trip_errors").doc().set({
                    tripId,
                    email,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    errorMessage: error.message
                });
            } catch (logErr) {
                console.error("Failed to log trip submission error:", logErr.message);
            }

            throw new HttpsError("internal", "Unable to process your submission right now. Please try again.");
        }
    }
);

exports.getTripPdfUrl = onCall(
    { cors: true, invoker: "public" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
        }
        if (!(await isAdminAuth(request.auth))) {
            throw new HttpsError("permission-denied", "Only admins can download trip PDFs.");
        }

        const submissionId = (request.data && typeof request.data.submissionId === "string") ?
            request.data.submissionId.trim() : "";
        if (!submissionId) {
            throw new HttpsError("invalid-argument", "A submission ID is required.");
        }

        const submissionSnap = await admin.firestore().collection("tripSubmissions").doc(submissionId).get();
        if (!submissionSnap.exists) {
            throw new HttpsError("not-found", "Submission not found.");
        }

        const { pdfStoragePath } = submissionSnap.data();
        const [url] = await admin.storage().bucket().file(pdfStoragePath).getSignedUrl({
            action: "read",
            expires: Date.now() + 10 * 60 * 1000
        });

        return { url };
    }
);

