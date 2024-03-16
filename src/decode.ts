import {
  createFile,
  MP4File,
  MP4ArrayBuffer,
  MP4VideoTrack,
  DataStream,
} from "mp4box";

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
      yield* generatedFrames;
      generatedFrames.length = 0;
    }
    videoDecoder.decode(chunk);
  }
  await videoDecoder.flush();
  yield* generatedFrames;
  videoDecoder.close();
};

export interface DemuxedVideo {
  encodedVideoChunks: EncodedVideoChunk[];
  decoderConfig: VideoDecoderConfig;
  videoTrack: MP4VideoTrack;
}

export const fetchAndDemuxVideo = async (
  ...args: Parameters<typeof fetch>
): Promise<DemuxedVideo> => {
  const encodedVideoChunks: EncodedVideoChunk[] = [];
  const videoTracks: MP4VideoTrack[] = [];

  const response = await fetch(...args);
  if (!response.ok) {
    throw new Error(`Error fetching video data: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Video response has no body.");
  }

  // Demux video file into chunks suitable for passing to VideoEncoder.encode().
  const file = createFile();
  file.onError = (e: string) => {
    throw new Error(`Error demuxing background: ${e}`);
  };
  file.onReady = (info) => {
    info.tracks
      .filter((track) => Object.hasOwn(track, "video"))
      .forEach((track) => videoTracks.push(track as MP4VideoTrack));
    if (videoTracks.length === 0) {
      throw new Error("Background video file has no video tracks.");
    }
    file.setExtractionOptions(videoTracks[0].id);
    file.start();
  };
  file.onSamples = (_track_id, _user, samples) => {
    samples.forEach((sample) =>
      encodedVideoChunks.push(
        new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: (1e6 * sample.cts) / sample.timescale,
          duration: (1e6 * sample.duration) / sample.timescale,
          data: sample.data,
        }),
      ),
    );
  };

  const fileSink = new MP4FileSink(file);
  await response.body.pipeTo(
    new WritableStream(fileSink, { highWaterMark: 2 }),
  );

  if (videoTracks.length === 0) {
    throw new Error("No video data was found in background video.");
  }

  const decoderConfig = {
    // Browsers don't yet support parsing full vp8 codec (eg: `vp08.00.41.08`),
    // they only support `vp8`.
    codec: videoTracks[0].codec.startsWith("vp08")
      ? "vp8"
      : videoTracks[0].codec,
    codedHeight: videoTracks[0].video.height,
    codedWidth: videoTracks[0].video.width,
    description: getDescription(file, videoTracks[0].id),
  };

  return { encodedVideoChunks, decoderConfig, videoTrack: videoTracks[0] };
};

const getDescription = (file: MP4File, track_id: number) => {
  const track = (file as any).getTrackById(track_id);
  for (const entry of track.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8); // Remove the box header.
    }
  }
  throw new Error("avcC, hvcC, vpcC, or av1C box not found");
};

// Wraps an MP4Box File as a WritableStream underlying sink.
class MP4FileSink implements UnderlyingSink {
  #file: MP4File;
  #offset = 0;

  constructor(file: MP4File) {
    this.#file = file;
  }

  write(chunk: Uint8Array) {
    // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array.
    const buffer = new ArrayBuffer(chunk.byteLength) as MP4ArrayBuffer;
    new Uint8Array(buffer).set(chunk);

    // Inform MP4Box where in the file this chunk is from.
    buffer.fileStart = this.#offset;
    this.#offset += buffer.byteLength;

    // Append chunk.
    this.#file.appendBuffer(buffer);
  }

  close() {
    this.#file.flush();
  }
}
