// Web-worker which repeatedly decodes the first video track from an encoded array buffer.
import {
  demuxArrayBufferIntoEncodedChunks,
  EncodedVideoTrack,
} from "../mp4demux";

import { SET_ENCODED_MEDIA, SetEncodedMediaMessage } from "./types";

interface State {
  encodedMedia?: ArrayBuffer;
  videoTrack?: EncodedVideoTrack;
  videoDecoder?: VideoDecoder;
}

const state: State = {};

onmessage = ({ data }) => {
  switch (data?.type) {
    case SET_ENCODED_MEDIA:
      setEncodedMedia(data as SetEncodedMediaMessage);
      break;
  }
};

const setEncodedMedia = async ({ encodedMedia }: SetEncodedMediaMessage) => {
  if (state.encodedMedia) {
    throw new Error("Encoded media may only be set once.");
  }
  state.encodedMedia = encodedMedia;

  const videoTrack = (
    await demuxArrayBufferIntoEncodedChunks(state.encodedMedia)
  ).filter((track) => track.type === "video")[0];

  if (!videoTrack) {
    throw new Error("Media has no video tracks.");
  }

  const { decoderConfig, encodedChunks } = videoTrack as EncodedVideoTrack;

  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      postMessage({ frame }, { transfer: [frame as unknown as Transferable] });
    },
    error: (error) => {
      throw error;
    },
  });
  videoDecoder.configure(decoderConfig);

  const encodedChunkIterator = encodedChunks.values();
  const enqueueChunk = () => {
    const { done, value } = encodedChunkIterator.next();
    if (done) {
      return;
    }
    videoDecoder.decode(value);
  };
  (videoDecoder as unknown as EventTarget).addEventListener(
    "dequeue",
    enqueueChunk,
  );
  enqueueChunk();
};
