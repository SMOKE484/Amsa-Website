import { elements } from './constants.js';

export const signaturePad = new SignaturePad(elements.signaturePadCanvas, { penColor: 'black' });

export function clearTripSignature() {
  signaturePad.clear();
  elements.tripSignature.value = '';
}
