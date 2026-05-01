// AudioWorkletProcessor: downsamples Float32 input to 16kHz mono PCM s16le
// and posts ArrayBuffer chunks (~200ms) back to the main thread.

class PcmWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
    this.inputSampleRate = sampleRate; // global in AudioWorkletGlobalScope
    this.ratio = this.inputSampleRate / this.targetSampleRate;
    this.buffer = [];
    this.bufferLen = 0;
    // ~200ms chunks at 16kHz mono = 3200 samples = 6400 bytes
    this.chunkSamples = Math.floor(this.targetSampleRate * 0.2);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0]; // mono (first channel only)
    if (!channel) return true;

    // Downsample by simple decimation w/ averaging.
    const out = new Float32Array(Math.floor(channel.length / this.ratio));
    let inIdx = 0;
    for (let outIdx = 0; outIdx < out.length; outIdx++) {
      const nextInIdx = (outIdx + 1) * this.ratio;
      let sum = 0;
      let count = 0;
      while (inIdx < nextInIdx && inIdx < channel.length) {
        sum += channel[Math.floor(inIdx)];
        count++;
        inIdx++;
      }
      out[outIdx] = count > 0 ? sum / count : 0;
    }

    this.buffer.push(out);
    this.bufferLen += out.length;

    while (this.bufferLen >= this.chunkSamples) {
      const merged = new Float32Array(this.bufferLen);
      let off = 0;
      for (const piece of this.buffer) {
        merged.set(piece, off);
        off += piece.length;
      }
      const take = merged.subarray(0, this.chunkSamples);
      const rest = merged.subarray(this.chunkSamples);
      this.buffer = rest.length > 0 ? [rest] : [];
      this.bufferLen = rest.length;

      // Convert Float32 [-1,1] to Int16 little-endian.
      const pcm = new ArrayBuffer(take.length * 2);
      const view = new DataView(pcm);
      for (let i = 0; i < take.length; i++) {
        const s = Math.max(-1, Math.min(1, take[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      this.port.postMessage(pcm, [pcm]);
    }

    return true;
  }
}

registerProcessor('pcm-worklet', PcmWorklet);
