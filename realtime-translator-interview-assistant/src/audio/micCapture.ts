// Microphone capture pipeline: getUserMedia → AudioWorklet (downsample to 16kHz mono PCM s16le)
// → posts ArrayBuffer chunks via callback.

import workletUrl from './pcm-worklet.js?url';

export type MicHandle = {
  stop: () => Promise<void>;
};

export async function startMicCapture(
  onChunk: (chunk: ArrayBuffer) => void,
): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(workletUrl);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-worklet', {
    processorOptions: { targetSampleRate: 16000 },
  });

  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    onChunk(e.data);
  };

  source.connect(node);
  // Don't connect to destination — we don't want to play mic back.

  return {
    async stop() {
      try {
        node.port.onmessage = null;
        node.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
      } catch (err) {
        console.error('[mic] stop failed:', err);
      }
    },
  };
}
