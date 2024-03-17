import { ArrayBufferTarget } from "webm-muxer";
import { createEncodingContext } from "../encode";

import { fetchAndDecodeAudioData, fetchAndDemuxVideo } from "./fetchWrappers";

export interface Status {
  state: "fetching" | "encoding" | "completed";
  progressPercentage?: number;
}

export interface RenderAudiogramOptions {
  audioUrl: string;
  audioSampleRate?: number;
  backgroundVideoUrl: string;
  width: number;
  height: number;
  videoFrameRate?: number;
  onStatus?: (status: Status) => void;
  barFillStyle?: string;
}

const RENDER_AUDIOGRAM_OPTIONS_DEFAULTS = {
  audioSampleRate: 44100,
  videoFrameRate: 30,
  onStatus: () => {},
  barFillStyle: "#ff000",
};

export const decodeFrames = async function* (
  decoderConfig: VideoDecoderConfig,
  encodedVideoChunks: EncodedVideoChunk[],
) {
  const generatedFrames: OffscreenCanvas[] = [];
  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      const canvas = new OffscreenCanvas(frame.codedWidth, frame.codedHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to create offscreen rendering context.");
      }
      ctx.drawImage(frame, 0, 0);
      frame.close();
      generatedFrames.push(canvas);
    },
    error: (e) => {
      throw e;
    },
  });
  videoDecoder.configure(decoderConfig);

  for (const chunk of encodedVideoChunks) {
    if (chunk.type === "key") {
      await videoDecoder.flush();
    }
    if (generatedFrames.length > 0) {
      yield* generatedFrames;
      generatedFrames.length = 0;
    }
    videoDecoder.decode(chunk);
  }
  await videoDecoder.flush();
  yield* generatedFrames;
  videoDecoder.close();
};

export const renderAudiogram = async (options: RenderAudiogramOptions) => {
  const {
    audioUrl,
    audioSampleRate,
    backgroundVideoUrl,
    width,
    height,
    videoFrameRate,
    onStatus,
    barFillStyle,
  } = {
    ...RENDER_AUDIOGRAM_OPTIONS_DEFAULTS,
    ...options,
  };

  // Fetch audio and background video data.
  onStatus({ state: "fetching" });

  const [decodedAudioBuffer, { decoderConfig, encodedChunks }] =
    await Promise.all([
      fetchAndDecodeAudioData(audioSampleRate, audioUrl),
      fetchAndDemuxVideo(backgroundVideoUrl),
    ]);

  const backgroundFrameIterator = (async function* () {
    while (1) {
      yield* decodeFrames(decoderConfig, encodedChunks);
    }
  })();

  const nextBackgroundFrame = async () => {
    const { done, value } = await backgroundFrameIterator.next();
    if (done) {
      throw new Error("Error getting next background frame.");
    }
    return value;
  };

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
      sampleRate: decodedAudioBuffer.sampleRate,
      numberOfChannels: decodedAudioBuffer.numberOfChannels,
    },
  });

  const audioSamplesPerFrame = Math.floor(
    decodedAudioBuffer.sampleRate / videoFrameRate,
  );
  let audioSampleOffset = 0;

  const audioChannelSamples = new Float32Array(audioSamplesPerFrame);
  const audioDataArray = new Float32Array(
    audioSamplesPerFrame * decodedAudioBuffer.numberOfChannels,
  );
  const binXOffset = Math.floor(
    (width - (binWidth + binXPadding * 2) * binsPerFrame) * 0.5,
  );

  const audiogramData = await generateAudiogramData(
    decodedAudioBuffer,
    videoFrameRate,
    binsPerFrame,
  );
  let frameIdx = 0;
  for (const frameData of audiogramData) {
    const timestamp = frameIdx * (1e6 / videoFrameRate);
    onStatus({
      state: "encoding",
      progressPercentage: (1e-4 * timestamp) / decodedAudioBuffer.duration,
    });
    frameIdx++;

    const canvas = new OffscreenCanvas(width, height);
    const canvasCtx = canvas.getContext("2d");
    if (canvasCtx === null) {
      throw new Error("Could not create off-screen canvas.");
    }

    if (!nextBackgroundFrame) {
      canvasCtx.fillStyle = "green";
      canvasCtx.fillRect(0, 0, width, height);
    } else {
      const backgroundFrame = await nextBackgroundFrame();
      canvasCtx.drawImage(backgroundFrame, 0, 0);
    }

    frameData.forEach((binHeight, binIdx) => {
      canvasCtx.fillStyle = barFillStyle;
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

    for (
      let channel = 0;
      channel < decodedAudioBuffer.numberOfChannels;
      channel++
    ) {
      decodedAudioBuffer.copyFromChannel(
        audioChannelSamples,
        channel,
        audioSampleOffset,
      );
      audioDataArray.set(audioChannelSamples, audioSamplesPerFrame * channel);
    }
    audioSampleOffset += audioSamplesPerFrame;

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: decodedAudioBuffer.sampleRate,
      numberOfFrames: audioSamplesPerFrame,
      numberOfChannels: decodedAudioBuffer.numberOfChannels,
      timestamp,
      data: audioDataArray,
    });
    audioEncoder.encode(audioData);
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  muxer.finalize();

  onStatus({ state: "completed" });
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
