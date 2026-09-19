/**
 * AudioWorklet processor for the master Downsample (FEAT-160).
 *
 * Runs on the audio thread (unlike the old ScriptProcessorNode), so enabling it
 * never glitches the main-thread TUI. Algorithm matches MicroTextures: a
 * one-pole low-pass before the hold to tame aliasing, an integer sample-and-hold
 * for the rate reduction, then an optional adjustable one-pole low-pass after.
 *
 * The source is shipped as a percent-encoded `data:` URL so the bundled app
 * needs no separate worklet file; both browsers and `node-web-audio-api`
 * accept data URLs for `audioWorklet.addModule`.
 */

export const DOWNSAMPLE_WORKLET_NAME = "spt-downsample";

export const DOWNSAMPLE_WORKLET_SOURCE = `
class SpectralPrismDownsample extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rateHz", defaultValue: 11025, minValue: 1000, maxValue: 24000, automationRate: "k-rate" },
      { name: "lowpassOn", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "lowpassHz", defaultValue: 8000, minValue: 200, maxValue: 24000, automationRate: "k-rate" },
    ];
  }
  constructor() {
    super();
    this.hold = [];
    this.count = [];
    this.pre = [];
    this.post = [];
  }
  static coeff(cutoff) {
    const rc = 1 / (2 * Math.PI * Math.max(cutoff, 1));
    const dt = 1 / sampleRate;
    return dt / (rc + dt);
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const rate = parameters.rateHz[0] || 11025;
    const factor = Math.max(1, Math.round(sampleRate / rate));
    const lowpassOn = (parameters.lowpassOn[0] || 0) > 0.5;
    const lowpassHz = parameters.lowpassHz[0] || 8000;
    const preCoeff = SpectralPrismDownsample.coeff(Math.min(rate * 0.5, sampleRate * 0.45));
    const postCoeff = SpectralPrismDownsample.coeff(lowpassHz);
    for (let c = 0; c < output.length; c++) {
      const inData = input.length ? (input[Math.min(c, input.length - 1)] || input[0]) : null;
      const outData = output[c];
      let pre = this.pre[c] || 0;
      let hold = this.hold[c] || 0;
      let post = this.post[c] || 0;
      let n = this.count[c] || 0;
      for (let i = 0; i < outData.length; i++) {
        const sample = inData ? (inData[i] || 0) : 0;
        pre += preCoeff * (sample - pre);
        if (n % factor === 0) hold = pre;
        let value = hold;
        if (lowpassOn) {
          post += postCoeff * (value - post);
          value = post;
        } else {
          post = value;
        }
        outData[i] = value;
        n++;
      }
      this.pre[c] = pre;
      this.hold[c] = hold;
      this.post[c] = post;
      this.count[c] = n;
    }
    return true;
  }
}
registerProcessor("${DOWNSAMPLE_WORKLET_NAME}", SpectralPrismDownsample);
`;

/**
 * URL passed to `audioWorklet.addModule`. A Blob URL works in browsers and is
 * explicitly handled by `node-web-audio-api`; a data URL is the fallback (Node's
 * worklet resolver does not resolve `data:` itself).
 */
export const DOWNSAMPLE_WORKLET_URL: string = (() => {
  if (
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    return URL.createObjectURL(
      new Blob([DOWNSAMPLE_WORKLET_SOURCE], { type: "text/javascript" }),
    );
  }
  return `data:text/javascript,${encodeURIComponent(DOWNSAMPLE_WORKLET_SOURCE)}`;
})();
