import { ArrayBufferTarget } from "webm-muxer";
import { createEncodingContext } from "./encode";

interface AudiogramOptions {
  width: number;
  height: number;
  videoFrameRate: number;
  nextBackgroundFrame?: () => Promise<Parameters<OffscreenCanvasRenderingContext2D["drawImage"]>[0]>;
}

export const renderAudiogram = async (
  audioBuffer: AudioBuffer,
  options: AudiogramOptions,
) => {
  const { width, height, videoFrameRate, nextBackgroundFrame } = { ...options };
  const xPadding = 4; // px
  const binXPadding = 4; // px
  const binWidth = 16; // px

  const binsPerFrame = Math.max(
    1,
    Math.floor((width - 2 * xPadding) / (binWidth + 2 * binXPadding)),
  );

  const target = new ArrayBufferTarget();
  const { muxer, videoEncoder, audioEncoder } = createEncodingContext(target, {
    video: {
      width,
      height,
      framerate: videoFrameRate,
    },
    audio: {
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
    },
  });

  const audioSamplesPerFrame = Math.floor(
    audioBuffer.sampleRate / videoFrameRate,
  );
  let audioSampleOffset = 0;

  const audioChannelSamples = new Float32Array(audioSamplesPerFrame);
  const audioDataArray = new Float32Array(
    audioSamplesPerFrame * audioBuffer.numberOfChannels,
  );
  const binXOffset = Math.floor(
    (width - (binWidth + binXPadding * 2) * binsPerFrame) * 0.5,
  );

  const audiogramData = await generateAudiogramData(
    audioBuffer,
    videoFrameRate,
    binsPerFrame,
  );
  let frameIdx = 0;
  for (const frameData of audiogramData) {
    const timestamp = frameIdx * (1e6 / videoFrameRate);
    frameIdx++;

    const canvas = new OffscreenCanvas(width, height);
    const canvasCtx = canvas.getContext("2d");
    if (canvasCtx === null) {
      throw new Error("Could not create off-screen canvas.");
    }

    if(!nextBackgroundFrame) {
      canvasCtx.fillStyle = "green";
      canvasCtx.fillRect(0, 0, width, height);
    } else {
      const backgroundFrame = await nextBackgroundFrame();
      canvasCtx.drawImage(backgroundFrame, 0, 0);
    }

    frameData.forEach((binHeight, binIdx) => {
      canvasCtx.fillStyle = "red";
      canvasCtx.fillRect(
        binXOffset + binIdx * (binWidth + binXPadding * 2) + binXPadding,
        height * (0.5 - 0.3 * binHeight) - 1,
        binWidth,
        height * 0.6 * binHeight + 1,
      );
    });

    const frame = new VideoFrame(canvas, { timestamp });
    videoEncoder.encode(frame);
    frame.close();

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      audioBuffer.copyFromChannel(
        audioChannelSamples,
        channel,
        audioSampleOffset,
      );
      audioDataArray.set(audioChannelSamples, audioSamplesPerFrame * channel);
    }
    audioSampleOffset += audioSamplesPerFrame;

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: audioBuffer.sampleRate,
      numberOfFrames: audioSamplesPerFrame,
      numberOfChannels: audioBuffer.numberOfChannels,
      timestamp,
      data: audioDataArray,
    });
    audioEncoder.encode(audioData);
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  muxer.finalize();

  const { buffer } = muxer.target;
  return buffer;
};

/**
 * Given decoded audio, return an iterator of Float32Arrays of bin heights for each video frame.
 */
const generateAudiogramData = async (
  buffer: AudioBuffer,
  videoFrameRate: number,
  binsPerFrame: number,
) => {
  // Aim for a sample rate of ~44.1 kHz
  const samplesPerBin = Math.ceil(44100 / (binsPerFrame * videoFrameRate));
  const sampleRate = samplesPerBin * binsPerFrame * videoFrameRate;

  // How many frames of video are we generating?
  const videoFrameCount = Math.ceil(buffer.duration * videoFrameRate);

  // Create an audio context where there a binsPerFrame samples per video frame.
  const audioCtx = new OfflineAudioContext(
    1,
    samplesPerBin * binsPerFrame * videoFrameCount,
    sampleRate,
  );

  // Render samples.
  const source = new AudioBufferSourceNode(audioCtx, {
    buffer,
  });
  source.connect(audioCtx.destination);
  source.start();

  // Get data.
  const resampledAudioBuffer = await audioCtx.startRendering();
  const resampledData = resampledAudioBuffer.getChannelData(0);

  // Coalesce samples into bins.
  return (function* () {
    for (let frameIdx = 0; frameIdx < videoFrameCount; frameIdx++) {
      yield Float32Array.from(new Array(binsPerFrame).keys(), (binIdx) =>
        resampledData
          .slice(
            (frameIdx * binsPerFrame + binIdx) * samplesPerBin,
            (frameIdx * binsPerFrame + binIdx + 1) * samplesPerBin,
          )
          .reduce((accum, val) => Math.max(accum, Math.abs(val)), 0),
      );
    }
  })();
};
