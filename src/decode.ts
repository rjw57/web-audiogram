import { createFile, MP4File, MP4ArrayBuffer, MP4VideoTrack } from "mp4box";

export interface DemuxedVideo {
  encodedVideoChunks: EncodedVideoChunk[];
  videoTrack: MP4VideoTrack;
}

export const fetchAndDemuxVideo = async (
  ...args: Parameters<typeof fetch>
): Promise<DemuxedVideo> => {
  const encodedVideoChunks: EncodedVideoChunk[] = [];
  let videoTrack: MP4VideoTrack | null = null;

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
    const videoTracks = info.tracks.filter((track) =>
      Object.hasOwn(track, "video"),
    ) as MP4VideoTrack[];
    if (videoTracks.length === 0) {
      throw new Error("Background video file has no video tracks.");
    }
    videoTrack = videoTracks[0];
    file.setExtractionOptions(videoTrack.id);
    file.start();
  };
  file.onSamples = (_track_id, _user, samples) =>
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

  const fileSink = new MP4FileSink(file);
  await response.body.pipeTo(
    new WritableStream(fileSink, { highWaterMark: 2 }),
  );
  file.flush();

  if (!videoTrack || encodedVideoChunks.length === 0) {
    throw new Error("No video data was found in background video.");
  }

  return { encodedVideoChunks, videoTrack };
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
