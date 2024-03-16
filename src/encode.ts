import {
  Muxer,
  ArrayBufferTarget,
  FileSystemWritableFileStreamTarget,
  StreamTarget,
} from "webm-muxer";

type Target =
  | ArrayBufferTarget
  | FileSystemWritableFileStreamTarget
  | StreamTarget;

interface EncodingOptions {
  video: {
    width: number;
    height: number;
    framerate: number;
  };
  audio: {
    numberOfChannels: number;
    sampleRate: number;
  };
}

interface EncodingContext<T extends Target> {
  muxer: Muxer<T>;
  videoEncoder: VideoEncoder;
  audioEncoder: AudioEncoder;
}

export const createEncodingContext = <T extends Target>(
  target: T,
  options: EncodingOptions,
): EncodingContext<T> => {
  const {
    video: { width, height, framerate },
    audio: { numberOfChannels, sampleRate },
  } = options;
  const muxer = new Muxer({
    target,
    video: {
      codec: "V_VP8",
      width,
      height,
    },
    audio: {
      codec: "A_OPUS",
      numberOfChannels: numberOfChannels,
      sampleRate: sampleRate,
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
    framerate,
    bitrate: 1e6,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  audioEncoder.configure({
    codec: "opus",
    sampleRate: sampleRate,
    numberOfChannels: numberOfChannels,
    bitrate: 192e3,
  });

  return { muxer, videoEncoder, audioEncoder };
};
