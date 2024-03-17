export const decodeVideo = async function* (
  decoderConfig: VideoDecoderConfig,
  encodedVideoChunks: EncodedVideoChunk[],
) {
  const generatedFrames: VideoFrame[] = [];
  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      generatedFrames.push(frame);
    },
    error: (e) => {
      throw e;
    },
  });
  videoDecoder.configure(decoderConfig);

  const chunksIterator = encodedVideoChunks.values();

  let done = false;
  const generatedFrameBufferLength = 5;
  while (!done) {
    done = await new Promise<boolean>((resolve) => {
      const enqueueChunk = () => {
        const { done, value } = chunksIterator.next();
        if (!done) {
          videoDecoder.decode(value);
        }

        if (generatedFrames.length >= generatedFrameBufferLength || done) {
          (videoDecoder as unknown as EventTarget).removeEventListener(
            "dequeue",
            enqueueChunk,
          );
          resolve(!!done);
        }
      };
      (videoDecoder as unknown as EventTarget).addEventListener(
        "dequeue",
        enqueueChunk,
      );
      enqueueChunk();
    });
    while (generatedFrames.length > 0.5 * generatedFrameBufferLength) {
      yield generatedFrames.shift() as VideoFrame;
    }
  }
  await videoDecoder.flush();
  yield* generatedFrames;
};

export default decodeVideo;
