// Kept byte-for-byte identical to ALUMNI_TRIP_WAIVER_TEXT / ALUMNI_TRIP_POPIA_TEXT
// in functions/index.js -- there is no shared module between functions/ and the
// browser, so both copies are updated by hand when the wording changes.
// NOTE: placeholder legal copy -- have it reviewed before relying on it for a real trip.
export const waiverText = "I, the undersigned, confirm that I am voluntarily participating in the " +
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

export const popiaText = "I consent to Alusani Maths and Science Academy collecting, storing, and " +
    "processing the personal information (including medical information) I have provided on this form, solely " +
    "for the purpose of organising and ensuring my safety during this trip, in accordance with the Protection " +
    "of Personal Information Act (POPIA).";

export const elements = {
  form: document.getElementById('alumniTripForm'),
  tripSelect: document.getElementById('tripSelect'),
  fullName: document.getElementById('fullName'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone'),
  emergencyContactName: document.getElementById('emergencyContactName'),
  emergencyContactPhone: document.getElementById('emergencyContactPhone'),
  emergencyContactRelationship: document.getElementById('emergencyContactRelationship'),
  medicalConditions: document.getElementById('medicalConditions'),
  allergies: document.getElementById('allergies'),
  medicalAidDetails: document.getElementById('medicalAidDetails'),
  waiverTextContainer: document.getElementById('waiverTextContainer'),
  waiverAgreed: document.getElementById('waiverAgreed'),
  popiaTextContainer: document.getElementById('popiaTextContainer'),
  popiaConsent: document.getElementById('popiaConsent'),
  signaturePadCanvas: document.getElementById('tripSignaturePad'),
  clearSignatureBtn: document.getElementById('clearTripSignature'),
  tripSignature: document.getElementById('tripSignature'),
  honeypot: document.getElementById('companyWebsite'),
  submitBtn: document.getElementById('submitTripFormBtn'),
  formSection: document.getElementById('tripFormSection'),
  successSection: document.getElementById('tripSuccessSection'),
  successMessage: document.getElementById('tripSuccessMessage'),
  toastContainer: document.getElementById('toastContainer'),
  currentYear: document.getElementById('currentYear')
};
