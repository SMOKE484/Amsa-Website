import { elements } from './constants.js';

export const signaturePads = {
  parent: new SignaturePad(elements.parentSignaturePad, { penColor: 'black' }),
  learner: new SignaturePad(elements.learnerSignaturePad, { penColor: 'black' }),
  parentPledge: new SignaturePad(elements.parentSignaturePadPledge, { penColor: 'black' })
};

export function initializeSignaturePads() {
  // Signature pads are initialized in the export
}

export function clearSignature() {
  signaturePads.parent.clear();
  elements.parentSignature.value = '';
}

export function clearLearnerSignature() {
  signaturePads.learner.clear();
  elements.learnerSignature.value = '';
}

export function clearParentSignaturePledge() {
  signaturePads.parentPledge.clear();
  elements.parentSignaturePledge.value = '';
}