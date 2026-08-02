import { elements } from './constants.js';

function createTripSignaturePad(canvasEl, hiddenInputEl) {
  const pad = new SignaturePad(canvasEl, { penColor: 'black' });
  return {
    pad,
    isEmpty: () => pad.isEmpty(),
    toDataURL: () => pad.toDataURL('image/png'),
    clear: () => {
      pad.clear();
      if (hiddenInputEl) hiddenInputEl.value = '';
    }
  };
}

// Alumni trips use a single self-signature; student trips need both a
// parent/guardian and a learner signature. All three canvases exist in the
// DOM at all times (only their wrapping section's visibility toggles based
// on the selected trip's audienceType -- see renderTripSpecificFields() in
// main.js), so all three pads are created once, up front.
export const signaturePad = createTripSignaturePad(elements.signaturePadCanvas, elements.signatureInput);
export const parentSignaturePad = createTripSignaturePad(elements.parentSignaturePadCanvas, elements.parentSignatureInput);
export const learnerSignaturePad = createTripSignaturePad(elements.learnerSignaturePadCanvas, elements.learnerSignatureInput);
