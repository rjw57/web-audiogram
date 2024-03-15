import { useRef } from "react";

import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import { Muxer, ArrayBufferTarget } from "webm-muxer";

const DEFAULT_SAMPLE_RATE = 44100;

const decodeAudioData = (
  buffer: ArrayBuffer,
  audioCtx?: BaseAudioContext,
): Promise<AudioBuffer> =>
  new Promise((resolve, reject) =>
    (
      audioCtx ?? new OfflineAudioContext(1, 1, DEFAULT_SAMPLE_RATE)
    ).decodeAudioData(buffer, resolve, reject),
  );

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
  return Array.from(new Array(videoFrameCount).keys(), (frameIdx) =>
    Float32Array.from(new Array(binsPerFrame).keys(), (binIdx) =>
      resampledData
        .slice(
          (frameIdx * binsPerFrame + binIdx) * samplesPerBin,
          (frameIdx * binsPerFrame + binIdx + 1) * samplesPerBin,
        )
        .reduce((accum, val) => Math.max(accum, Math.abs(val)), 0),
    ),
  );
};

const renderAudiogram = async (
  audioBuffer: AudioBuffer,
  width: number,
  height: number,
  videoFrameRate: number,
) => {
  const xPadding = 4; // px
  const binXPadding = 4; // px
  const binWidth = 16; // px

  const binsPerFrame = Math.max(
    1,
    Math.floor((width - 2 * xPadding) / (binWidth + 2 * binXPadding)),
  );

  const audiogramData = await generateAudiogramData(
    audioBuffer,
    videoFrameRate,
    binsPerFrame,
  );
  const videoFrameCount = audiogramData.length;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "V_VP8",
      width,
      height,
    },
    audio: {
      codec: "A_OPUS",
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    },
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  videoEncoder.configure({
    codec: "vp8",
    width,
    height,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  audioEncoder.configure({
    codec: "opus",
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
  });

  const audioSamplesPerFrame = Math.floor(
    audioBuffer.sampleRate / videoFrameRate,
  );
  let audioSampleOffset = 0;

  const audioChannelSamples = new Float32Array(audioSamplesPerFrame);
  const audioDataArray = new Float32Array(
    audioSamplesPerFrame * audioBuffer.numberOfChannels,
  );
  const binXOffset = Math.floor((width - (binWidth + binXPadding * 2) * binsPerFrame) * 0.5);
  for (let frameIdx = 0; frameIdx < videoFrameCount; frameIdx++) {
    const timestamp = frameIdx * (1e6 / videoFrameRate);

    const canvas = new OffscreenCanvas(width, height);
    const canvasCtx = canvas.getContext("2d");
    if (canvasCtx === null) {
      throw new Error("Could not create off-screen canvas.");
    }
    canvasCtx.fillStyle = "green";
    canvasCtx.fillRect(0, 0, width, height);
    audiogramData[frameIdx].forEach((binHeight, binIdx) => {
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

const doIt = async (videoEl: HTMLVideoElement) => {
  // Fetch audio data.
  const response = await fetch("audio/nonaspr-cnuts-song-all.mp3");
  if (!response.ok) {
    throw new Error(`Error fetching audio data: ${response.statusText}`);
  }

  // Decode audio data into PCM samples.
  const decodedAudioBuffer = await decodeAudioData(
    await response.arrayBuffer(),
  );

  const encodedMediaBuffer = await renderAudiogram(
    decodedAudioBuffer,
    videoEl.width,
    videoEl.height,
    30,
  );

  const blob = new Blob([encodedMediaBuffer]);
  videoEl.src = URL.createObjectURL(blob);
  videoEl.play();
};

const App = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          WebAudio Experiments
        </Typography>
        <Typography variant="body1" component="p" sx={{ mb: 2 }}>
          Chrome only for the moment, sorry :(.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => {
            videoRef.current && doIt(videoRef.current);
          }}
        >
          Load audio
        </Button>
        <p>
          <video controls ref={videoRef} width={640} height={320} />
        </p>
      </Box>
    </Container>
  );
};

export default App;
