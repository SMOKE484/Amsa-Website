// Kept byte-for-byte identical to TRIP_POPIA_TEXT in functions/index.js --
// there is no shared module between functions/ and the browser, so both
// copies are updated by hand. POPIA consent is the one fixed, global section
// on this form; the other 7 policy sections (terms, payments/refunds,
// indemnity, medical emergency consent, transport, learner conduct,
// personal property) are per-trip and admin-editable, so they're rendered
// dynamically from the selected trip's own Firestore fields instead of a
// constant here -- see renderTripSpecificFields() in main.js.
// NOTE: placeholder legal copy -- have it reviewed before relying on it for a real trip.
export const popiaText = "I consent to Alusani Maths and Science Academy collecting, storing, and " +
    "processing the personal information (including medical information) I have provided on this form, solely " +
    "for the purpose of organising and ensuring my safety during this trip, in accordance with the Protection " +
    "of Personal Information Act (POPIA).";

export const elements = {
  form: document.getElementById('tripForm'),
  formTitle: document.getElementById('tripFormTitle'),
  tripSelect: document.getElementById('tripSelect'),

  tripInfoSection: document.getElementById('tripInfoSection'),
  tripInfoLocation: document.getElementById('tripInfoLocation'),
  tripInfoEventType: document.getElementById('tripInfoEventType'),
  tripInfoOrganizer: document.getElementById('tripInfoOrganizer'),
  tripInfoIndividualsInCharge: document.getElementById('tripInfoIndividualsInCharge'),
  tripInfoDeparture: document.getElementById('tripInfoDeparture'),
  tripInfoReturn: document.getElementById('tripInfoReturn'),
  tripInfoTransportMode: document.getElementById('tripInfoTransportMode'),

  participantName: document.getElementById('participantName'),
  birthDate: document.getElementById('birthDate'),
  birthDateRequiredMarker: document.getElementById('birthDateRequiredMarker'),

  yourContactSection: document.getElementById('yourContactSection'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone'),

  parentGuardianSection: document.getElementById('parentGuardianSection'),
  parentGuardianName: document.getElementById('parentGuardianName'),
  parentGuardianAddress: document.getElementById('parentGuardianAddress'),
  parentGuardianHomePhone: document.getElementById('parentGuardianHomePhone'),
  parentGuardianWorkPhone: document.getElementById('parentGuardianWorkPhone'),
  parentGuardianEmail: document.getElementById('parentGuardianEmail'),

  emergencyContactName: document.getElementById('emergencyContactName'),
  emergencyContactPhone: document.getElementById('emergencyContactPhone'),
  emergencyContactRelationship: document.getElementById('emergencyContactRelationship'),
  medicalConditions: document.getElementById('medicalConditions'),
  allergies: document.getElementById('allergies'),
  medicalAidDetails: document.getElementById('medicalAidDetails'),

  policySectionsContainer: document.getElementById('policySectionsContainer'),
  agreedToTerms: document.getElementById('agreedToTerms'),
  popiaTextContainer: document.getElementById('popiaTextContainer'),
  popiaConsent: document.getElementById('popiaConsent'),

  alumniSignatureSection: document.getElementById('alumniSignatureSection'),
  signaturePadCanvas: document.getElementById('signaturePadCanvas'),
  clearSignatureBtn: document.getElementById('clearSignatureBtn'),
  signatureInput: document.getElementById('signatureInput'),

  studentSignatureSection: document.getElementById('studentSignatureSection'),
  parentSignaturePadCanvas: document.getElementById('parentSignaturePadCanvas'),
  clearParentSignatureBtn: document.getElementById('clearParentSignatureBtn'),
  parentSignatureInput: document.getElementById('parentSignatureInput'),
  learnerSignaturePadCanvas: document.getElementById('learnerSignaturePadCanvas'),
  clearLearnerSignatureBtn: document.getElementById('clearLearnerSignatureBtn'),
  learnerSignatureInput: document.getElementById('learnerSignatureInput'),

  honeypot: document.getElementById('companyWebsite'),
  submitBtn: document.getElementById('submitTripFormBtn'),
  formSection: document.getElementById('tripFormSection'),
  successSection: document.getElementById('tripSuccessSection'),
  successMessage: document.getElementById('tripSuccessMessage'),
  signUpAnotherTripBtn: document.getElementById('signUpAnotherTripBtn'),
  toastContainer: document.getElementById('toastContainer'),
  currentYear: document.getElementById('currentYear')
};

// Section headings, in display order, matched to the trip-doc field each
// pulls its (admin-editable) text from -- shared by main.js (rendering) and
// form.js/functions/index.js callers that need the same field list.
export const POLICY_SECTIONS = [
  { heading: 'Terms & Conditions', field: 'termsConditionsText' },
  { heading: 'Payments & Refunds', field: 'paymentsRefundsText' },
  { heading: 'Indemnity & Limitation of Liability', field: 'indemnityText' },
  { heading: 'Medical Emergency Consent', field: 'medicalEmergencyConsentText' },
  { heading: 'Transport & Supervision', field: 'transportSupervisionText' },
  { heading: 'Learner Conduct & Compliance', field: 'learnerConductText' },
  { heading: 'Personal Property', field: 'personalPropertyText' }
];

// Fallback wording, keyed by the same field names as POLICY_SECTIONS, for a
// trip doc created before these fields existed (e.g. a trip carried over
// from before this feature shipped). Without this, such a trip renders 7
// section headings with nothing underneath them on the public form -- the
// signer would be asked to agree to text they were never shown. Kept in sync
// by hand with the identically-worded DEFAULT_* constants in scripts/admin.js
// and functions/index.js (the latter is what actually ends up in the PDF as
// a fallback; this copy is what a signer sees on-screen before submitting).
export const DEFAULT_POLICY_TEXT = {
  termsConditionsText: "No alcohol or hubbly (hookah) is allowed.\n" +
    "No participant should walk alone.\n" +
    "If a participant chooses to go somewhere, they must tell a staff member or fellow participant where they are going.\n" +
    "Participants must keep their phone on at all times during the trip.\n" +
    "When it is time to leave a venue, staff will look for a missing participant for a maximum of 30 minutes. " +
    "If the participant cannot be found within that time, they will need to make their own way back.\n" +
    "Voluntary Participation & Risk Acknowledgment: I understand that attendance on this trip is voluntary. I accept " +
    "that participation in any excursion involves inherent risks, including but not limited to travel accidents, " +
    "injury, illness, or loss of property, and I voluntarily accept these risks on behalf of the participant named " +
    "on this form.",
  paymentsRefundsText: "No refunds will be issued to a participant who decides not to attend the " +
    "trip, regardless of the circumstances. All payments made are non-refundable. If a specific date was agreed for " +
    "a deposit or instalment and the participant fails to honour that date, the amount already paid will be " +
    "retained as a deposit. Should the participant choose to continue paying after the due date has passed, any " +
    "further payment will restart from R0 (for example, if the agreed deposit was R1000 and R500 had been paid by " +
    "the due date, a late continuation restarts the payment count at R0). The only instance in which a refund will " +
    "be provided is if the trip itself is cancelled by AMSA; otherwise, no refunds will be given.",
  indemnityText: "I hereby indemnify and hold harmless AMSA Academy, its staff, management, and " +
    "representatives from any claims, damages, or legal action arising from injury, death, loss, or damage " +
    "suffered by the participant during this trip, except where such loss is caused by the gross negligence or " +
    "wilful misconduct of AMSA Academy.",
  medicalEmergencyConsentText: "In the event of illness or injury, I authorise AMSA Academy staff " +
    "to obtain necessary medical treatment for the participant. I accept full responsibility for all medical costs " +
    "incurred, and I will disclose any medical conditions, allergies, or medication requirements to AMSA in writing " +
    "before the trip departs.",
  transportSupervisionText: "I understand that transport will be provided by AMSA or its appointed " +
    "service providers. While AMSA will take reasonable precautions for participant safety and supervision, I " +
    "accept that AMSA cannot guarantee that accidents or incidents will not occur during travel or at the venue.",
  learnerConductText: "The participant will abide by all instructions given by AMSA staff and venue " +
    "officials. I understand that if the participant engages in misconduct, unsafe behaviour, or illegal activity, " +
    "AMSA reserves the right to send the participant home at my expense, and AMSA is not liable for incidents " +
    "resulting from a participant's failure to follow instructions.",
  personalPropertyText: "AMSA Academy will not be held responsible for any loss, theft, or damage to " +
    "personal belongings, including cell phones, money, or clothing, during this trip."
};
