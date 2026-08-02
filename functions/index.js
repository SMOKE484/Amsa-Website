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
function isValidPastDate(dateString) {
    if (!dateString || typeof dateString !== "string") return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date.getTime() <= Date.now();
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
// NOTE: this POPIA wording is placeholder copy, not legal advice. Have it
// reviewed by the Academy's insurer/legal advisor before relying on it for a
// real trip. It must stay byte-for-byte identical to the copy shown to
// signees in tripScripts/constants.js — there is no shared module between
// functions/ and the browser, so both copies are updated by hand. Unlike the
// 7 DEFAULT_* policy texts below, POPIA consent is a fixed, global checkbox
// (not admin-editable per trip).
const TRIP_POPIA_TEXT = "I consent to Alusani Maths and Science Academy collecting, storing, and " +
    "processing the personal information (including medical information) I have provided on this form, solely " +
    "for the purpose of organising and ensuring my safety during this trip, in accordance with the Protection " +
    "of Personal Information Act (POPIA).";

// Starting-point wording for each trip's 7 policy sections, transcribed from
// AMSA's real paper consent form template. Admins can edit these per trip in
// the Add/Edit Trip modal (pages/admin.html / scripts/admin.js), which is
// where new trips actually get their text from -- these constants are used
// here only as a defensive fallback so a trip doc created before these
// fields existed (or with a field left blank) still renders a PDF with real
// wording instead of a blank section. Kept in sync by hand with the
// identically-named DEFAULT_* constants in scripts/admin.js.
const DEFAULT_TERMS_TEXT = "No alcohol or hubbly (hookah) is allowed.\n" +
    "No participant should walk alone.\n" +
    "If a participant chooses to go somewhere, they must tell a staff member or fellow participant where they are going.\n" +
    "Participants must keep their phone on at all times during the trip.\n" +
    "When it is time to leave a venue, staff will look for a missing participant for a maximum of 30 minutes. " +
    "If the participant cannot be found within that time, they will need to make their own way back.\n" +
    "Voluntary Participation & Risk Acknowledgment: I understand that attendance on this trip is voluntary. I accept " +
    "that participation in any excursion involves inherent risks, including but not limited to travel accidents, " +
    "injury, illness, or loss of property, and I voluntarily accept these risks on behalf of the participant named " +
    "on this form.";
const DEFAULT_PAYMENTS_REFUNDS_TEXT = "No refunds will be issued to a participant who decides not to attend the " +
    "trip, regardless of the circumstances. All payments made are non-refundable. If a specific date was agreed for " +
    "a deposit or instalment and the participant fails to honour that date, the amount already paid will be " +
    "retained as a deposit. Should the participant choose to continue paying after the due date has passed, any " +
    "further payment will restart from R0 (for example, if the agreed deposit was R1000 and R500 had been paid by " +
    "the due date, a late continuation restarts the payment count at R0). The only instance in which a refund will " +
    "be provided is if the trip itself is cancelled by AMSA; otherwise, no refunds will be given.";
const DEFAULT_INDEMNITY_TEXT = "I hereby indemnify and hold harmless AMSA Academy, its staff, management, and " +
    "representatives from any claims, damages, or legal action arising from injury, death, loss, or damage " +
    "suffered by the participant during this trip, except where such loss is caused by the gross negligence or " +
    "wilful misconduct of AMSA Academy.";
const DEFAULT_MEDICAL_EMERGENCY_CONSENT_TEXT = "In the event of illness or injury, I authorise AMSA Academy staff " +
    "to obtain necessary medical treatment for the participant. I accept full responsibility for all medical costs " +
    "incurred, and I will disclose any medical conditions, allergies, or medication requirements to AMSA in writing " +
    "before the trip departs.";
const DEFAULT_TRANSPORT_SUPERVISION_TEXT = "I understand that transport will be provided by AMSA or its appointed " +
    "service providers. While AMSA will take reasonable precautions for participant safety and supervision, I " +
    "accept that AMSA cannot guarantee that accidents or incidents will not occur during travel or at the venue.";
const DEFAULT_LEARNER_CONDUCT_TEXT = "The participant will abide by all instructions given by AMSA staff and venue " +
    "officials. I understand that if the participant engages in misconduct, unsafe behaviour, or illegal activity, " +
    "AMSA reserves the right to send the participant home at my expense, and AMSA is not liable for incidents " +
    "resulting from a participant's failure to follow instructions.";
const DEFAULT_PERSONAL_PROPERTY_TEXT = "AMSA Academy will not be held responsible for any loss, theft, or damage to " +
    "personal belongings, including cell phones, money, or clothing, during this trip.";

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
    const isStudent = data.audienceType === "student";

    cursor.heading("Alusani Maths and Science Academy", 16);
    cursor.heading(isStudent ? "Parent/Guardian Consent & Indemnity Form" : "Consent & Indemnity Form", 13);
    cursor.spacer(6);
    cursor.line(`Trip: ${data.tripName}`);
    if (data.location) cursor.line(`Location: ${data.location}`);
    if (data.eventType) cursor.line(`Type of Event: ${data.eventType}`);
    if (data.organizerName) cursor.line(`Organizer: ${data.organizerName}`);
    if (data.individualsInCharge) cursor.line(`Individual(s) in Charge: ${data.individualsInCharge}`);
    if (data.departureDisplay) cursor.line(`Departure: ${data.departureDisplay}`);
    if (data.returnDisplay) cursor.line(`Return: ${data.returnDisplay}`);
    if (data.transportMode) cursor.line(`Mode of Transportation: ${data.transportMode}`);
    cursor.spacer(10);

    cursor.heading("Participant Information");
    cursor.line(`Name: ${data.participantName}`);
    if (data.birthDate) cursor.line(`Birth Date: ${data.birthDate}`);
    cursor.spacer(10);

    if (isStudent) {
        cursor.heading("Parent/Guardian Information");
        cursor.line(`Name: ${data.parentGuardianName}`);
        cursor.line(`Home Address: ${data.parentGuardianAddress}`);
        cursor.line(`Home Phone: ${data.parentGuardianHomePhone}`);
        cursor.line(`Work Phone: ${data.parentGuardianWorkPhone || "Not provided"}`);
        cursor.line(`Email: ${data.parentGuardianEmail}`);
    } else {
        cursor.heading("Signee Information");
        cursor.line(`Email: ${data.email}`);
        cursor.line(`Phone: ${data.phone}`);
    }
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

    const policySections = [
        ["Terms & Conditions", data.termsConditionsText || DEFAULT_TERMS_TEXT],
        ["Payments & Refunds", data.paymentsRefundsText || DEFAULT_PAYMENTS_REFUNDS_TEXT],
        ["Indemnity & Limitation of Liability", data.indemnityText || DEFAULT_INDEMNITY_TEXT],
        ["Medical Emergency Consent", data.medicalEmergencyConsentText || DEFAULT_MEDICAL_EMERGENCY_CONSENT_TEXT],
        ["Transport & Supervision", data.transportSupervisionText || DEFAULT_TRANSPORT_SUPERVISION_TEXT],
        ["Learner Conduct & Compliance", data.learnerConductText || DEFAULT_LEARNER_CONDUCT_TEXT],
        ["Personal Property", data.personalPropertyText || DEFAULT_PERSONAL_PROPERTY_TEXT]
    ];
    for (const [heading, text] of policySections) {
        cursor.heading(heading);
        cursor.wrapped(text);
        cursor.spacer(10);
    }
    cursor.line("[X] I confirm that I have read and agree to all of the above terms and conditions.");
    cursor.spacer(10);

    cursor.heading("POPIA Consent");
    cursor.wrapped(TRIP_POPIA_TEXT);
    cursor.spacer(6);
    cursor.line("[X] I consent to the processing of my personal information as described above.");
    cursor.spacer(16);

    async function drawSignature(base64, label, signerName) {
        const signatureBytes = Buffer.from(base64, "base64");
        const pngImage = await pdfDoc.embedPng(signatureBytes);
        const maxSigWidth = 250;
        const scale = Math.min(1, maxSigWidth / pngImage.width);
        const sigWidth = pngImage.width * scale;
        const sigHeight = pngImage.height * scale;

        cursor.ensureSpace(sigHeight + 50);
        cursor.heading(label);
        cursor.page.drawImage(pngImage, { x: cursor.margin, y: cursor.y - sigHeight, width: sigWidth, height: sigHeight });
        cursor.y -= sigHeight + 6;
        cursor.line(`Signed by ${signerName} on ${data.signedDateDisplay}`);
        cursor.spacer(20);
    }

    if (isStudent) {
        await drawSignature(data.parentSignatureBase64, "Parent/Guardian Signature", data.parentGuardianName);
        await drawSignature(data.learnerSignatureBase64, "Learner Signature", data.participantName);
    } else {
        await drawSignature(data.signatureBase64, "Signature", data.participantName);
    }

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

        const tripId = typeof data.tripId === "string" ? data.tripId.trim() : "";
        if (!tripId) {
            throw new HttpsError("invalid-argument", "A trip must be selected.");
        }

        const db = admin.firestore();
        const tripSnap = await db.collection("trips").doc(tripId).get();
        if (!tripSnap.exists || tripSnap.data().active !== true) {
            throw new HttpsError("failed-precondition", "This trip is not currently accepting sign-ups.");
        }
        const trip = tripSnap.data();

        // Audience type is always re-derived from the trip doc, never trusted
        // from the client -- it decides which fields/signatures are required
        // below. A trip doc created before this field existed predates the
        // parent/guardian workflow entirely, so it defaults to "alumni" (the
        // single-signer behavior this form already had).
        const isStudent = trip.audienceType === "student";
        const audienceType = isStudent ? "student" : "alumni";

        const participantName = typeof data.participantName === "string" ? data.participantName.trim() : "";
        const birthDate = typeof data.birthDate === "string" ? data.birthDate.trim() : "";
        const emergencyContactName = typeof data.emergencyContactName === "string" ? data.emergencyContactName.trim() : "";
        const emergencyContactPhone = typeof data.emergencyContactPhone === "string" ? data.emergencyContactPhone.trim() : "";
        const emergencyContactRelationship = typeof data.emergencyContactRelationship === "string" ?
            data.emergencyContactRelationship.trim() : "";
        const medicalConditions = typeof data.medicalConditions === "string" ? data.medicalConditions.trim() : "";
        const allergies = typeof data.allergies === "string" ? data.allergies.trim() : "";
        const medicalAidDetails = typeof data.medicalAidDetails === "string" ? data.medicalAidDetails.trim() : "";

        const requiredShortFields = { participantName, emergencyContactName, emergencyContactRelationship };
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
        if (!isValidPhone(emergencyContactPhone)) {
            throw new HttpsError("invalid-argument", "A valid emergency contact phone number is required.");
        }
        if (data.agreedToTerms !== true) {
            throw new HttpsError("invalid-argument", "You must agree to the terms and conditions to submit this form.");
        }
        if (data.popiaConsent !== true) {
            throw new HttpsError("invalid-argument", "You must consent to the processing of your personal information.");
        }

        let email = "";
        let phone = "";
        let parentGuardianName = "";
        let parentGuardianAddress = "";
        let parentGuardianHomePhone = "";
        let parentGuardianWorkPhone = "";
        let parentGuardianEmail = "";

        if (isStudent) {
            if (!isValidPastDate(birthDate)) {
                throw new HttpsError("invalid-argument", "A valid birth date is required.");
            }
            parentGuardianName = typeof data.parentGuardianName === "string" ? data.parentGuardianName.trim() : "";
            parentGuardianAddress = typeof data.parentGuardianAddress === "string" ? data.parentGuardianAddress.trim() : "";
            parentGuardianHomePhone = typeof data.parentGuardianHomePhone === "string" ?
                data.parentGuardianHomePhone.trim() : "";
            parentGuardianWorkPhone = typeof data.parentGuardianWorkPhone === "string" ?
                data.parentGuardianWorkPhone.trim() : "";
            parentGuardianEmail = typeof data.parentGuardianEmail === "string" ? data.parentGuardianEmail.trim() : "";

            const requiredParentFields = { parentGuardianName, parentGuardianAddress };
            for (const [key, value] of Object.entries(requiredParentFields)) {
                if (!value || value.length > 200) {
                    throw new HttpsError("invalid-argument", `${key} is required and must be under 200 characters.`);
                }
            }
            if (!isValidPhone(parentGuardianHomePhone)) {
                throw new HttpsError("invalid-argument", "A valid parent/guardian home phone number is required.");
            }
            if (parentGuardianWorkPhone && !isValidPhone(parentGuardianWorkPhone)) {
                throw new HttpsError("invalid-argument", "The parent/guardian work phone number is invalid.");
            }
            if (!isValidEmail(parentGuardianEmail)) {
                throw new HttpsError("invalid-argument", "A valid parent/guardian email address is required.");
            }
        } else {
            email = typeof data.email === "string" ? data.email.trim() : "";
            phone = typeof data.phone === "string" ? data.phone.trim() : "";
            if (!isValidEmail(email)) {
                throw new HttpsError("invalid-argument", "A valid email address is required.");
            }
            if (!isValidPhone(phone)) {
                throw new HttpsError("invalid-argument", "A valid South African phone number is required.");
            }
        }

        function decodeSignature(dataUrl, missingMessage, invalidMessage) {
            if (!/^data:image\/png;base64,/.test(dataUrl || "")) {
                throw new HttpsError("invalid-argument", missingMessage);
            }
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
            const bytes = Buffer.from(base64, "base64");
            if (bytes.length < 100 || bytes.length > 2 * 1024 * 1024) {
                throw new HttpsError("invalid-argument", invalidMessage);
            }
            return base64;
        }

        let signatureBase64 = "";
        let parentSignatureBase64 = "";
        let learnerSignatureBase64 = "";
        if (isStudent) {
            parentSignatureBase64 = decodeSignature(
                data.parentSignatureDataUrl,
                "A parent/guardian signature is required.",
                "The parent/guardian signature image is invalid."
            );
            learnerSignatureBase64 = decodeSignature(
                data.learnerSignatureDataUrl,
                "A learner signature is required.",
                "The learner signature image is invalid."
            );
        } else {
            signatureBase64 = decodeSignature(
                data.signatureDataUrl,
                "A signature is required.",
                "Signature image is invalid."
            );
        }

        // Idempotency key. For alumni, one submission per (trip, email). For
        // student trips the email collected on the form is the *parent's*,
        // and one parent can legitimately sign up more than one child for the
        // same trip -- folding the participant's name into the key stops that
        // second child from being wrongly blocked as a "duplicate".
        const dedupeSource = isStudent ?
            `${tripId}|${participantName.toLowerCase()}|${parentGuardianEmail.toLowerCase()}` :
            `${tripId}|${email.toLowerCase()}`;
        const dedupeKey = crypto.createHash("sha256").update(dedupeSource).digest("hex");
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
            const dateTimeOpts = { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" };
            const departureDisplay = trip.departureAt ? new Date(trip.departureAt).toLocaleString("en-ZA", dateTimeOpts) : "";
            const returnDisplay = trip.returnAt ? new Date(trip.returnAt).toLocaleString("en-ZA", dateTimeOpts) : "";

            const pdfBytes = await generateTripPdf({
                tripName: trip.name,
                location: trip.location,
                organizerName: trip.organizerName,
                eventType: trip.eventType,
                individualsInCharge: trip.individualsInCharge,
                departureDisplay, returnDisplay,
                transportMode: trip.transportMode,
                termsConditionsText: trip.termsConditionsText,
                paymentsRefundsText: trip.paymentsRefundsText,
                indemnityText: trip.indemnityText,
                medicalEmergencyConsentText: trip.medicalEmergencyConsentText,
                transportSupervisionText: trip.transportSupervisionText,
                learnerConductText: trip.learnerConductText,
                personalPropertyText: trip.personalPropertyText,
                audienceType,
                participantName, birthDate,
                email, phone,
                parentGuardianName, parentGuardianAddress, parentGuardianHomePhone,
                parentGuardianWorkPhone, parentGuardianEmail,
                emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
                medicalConditions, allergies, medicalAidDetails,
                signatureBase64, parentSignatureBase64, learnerSignatureBase64,
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
                audienceType,
                participantName,
                birthDate: birthDate || null,
                ...(isStudent ?
                    { parentGuardianName, parentGuardianAddress, parentGuardianHomePhone, parentGuardianWorkPhone, parentGuardianEmail } :
                    { email, phone }),
                emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
                medicalConditions, allergies, medicalAidDetails,
                agreedToTerms: true,
                popiaConsent: true,
                pdfStoragePath,
                dedupeKey,
                source: "public_form",
                signedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await lockRef.set({
                tripId,
                dedupeKey,
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
                    participantName,
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

