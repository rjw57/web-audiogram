import {
  DataStream,
  ISOFile,
  MP4ArrayBuffer,
  MP4Info,
  MP4Track,
  MP4VideoTrack,
  Sample,
  createFile,
} from "mp4box";

export interface ISOFileTrackSamples {
  file: ISOFile;
  fileInfo: MP4Info;
  track: MP4Track;
  samples: Sample[];
}

export type FilterTracksCallback = (tracks: MP4Track[]) => MP4Track[];

export interface ISOFileTransformerOptions {
  file?: ISOFile;
  filterTracks?: FilterTracksCallback;
}

const ISO_FILE_TRANSFORMER_OPTIONS_DEFAULTS = {
  filterTracks: (tracks: MP4Track[]) => tracks,
};

export class ISOFileTransformer {
  #file: ISOFile;
  #filterTracks: FilterTracksCallback;
  #tracksById: Map<number, MP4Track>;
  #info: MP4Info | null = null;
  #offset = 0;

  constructor(options?: ISOFileTransformerOptions) {
    const { file, filterTracks } = {
      ...ISO_FILE_TRANSFORMER_OPTIONS_DEFAULTS,
      ...options,
    };
    this.#file = file ?? createFile();
    this.#filterTracks = filterTracks;
    this.#tracksById = new Map<number, MP4Track>();
  }

  start(controller: TransformStreamDefaultController<ISOFileTrackSamples>) {
    this.#file.onError = (e) => {
      throw new Error(`Error demuxing media: ${e}`);
    };
    this.#file.onReady = (info) => {
      this.#info = info;
      for (const track of this.#filterTracks(info.tracks)) {
        this.#file.setExtractionOptions(track.id);
        this.#tracksById.set(track.id, track);
      }
      this.#file.start();
    };
    this.#file.onSamples = (trackId, _user, samples) => {
      if (!this.#info) {
        throw new Error("No file info was decoded before samples.");
      }
      const track = this.#tracksById.get(trackId);
      if (!track) {
        return;
      }
      controller.enqueue({
        file: this.#file,
        fileInfo: this.#info,
        track,
        samples,
      });
    };
  }

  transform(chunk: Uint8Array) {
    // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array.
    const buffer = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength,
    ) as MP4ArrayBuffer;

    // Inform MP4Box where in the file this chunk is from.
    buffer.fileStart = this.#offset;
    this.#offset += buffer.byteLength;

    // Append chunk.
    this.#file && this.#file.appendBuffer(buffer);
  }
}

export class ISOFileDemuxStream extends TransformStream<
  Uint8Array,
  ISOFileTrackSamples
> {
  constructor(
    writableStrategy?: QueuingStrategy<Uint8Array>,
    readableStrategy?: QueuingStrategy<ISOFileTrackSamples>,
    options?: ISOFileTransformerOptions,
  ) {
    super(new ISOFileTransformer(options), writableStrategy, readableStrategy);
  }
}

export class VideoDecodeTransfomer {
  #videoDecoder?: VideoDecoder;

  transform(
    chunk: ISOFileTrackSamples,
    controller: TransformStreamDefaultController<VideoFrame>,
  ) {
    const { file, track, samples } = chunk;

    if (!Object.hasOwn(track, "video")) {
      return;
    }
    const videoTrack = track as MP4VideoTrack;

    if (!this.#videoDecoder) {
      this.#videoDecoder = new VideoDecoder({
        output: (frame) => controller.enqueue(frame),
        error: (e) => {
          throw e;
        },
      });
      this.#videoDecoder.configure({
        // Browsers don't yet support parsing full vp8 codec (eg: `vp08.00.41.08`),
        // they only support `vp8`.
        codec: videoTrack.codec.startsWith("vp08") ? "vp8" : videoTrack.codec,
        codedHeight: videoTrack.video.height,
        codedWidth: videoTrack.video.width,
        description: VideoDecodeTransfomer.#getDescription(file, videoTrack.id),
      });
    }

    for (const sample of samples) {
      this.#videoDecoder.decode(
        new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: (1e6 * sample.cts) / sample.timescale,
          duration: (1e6 * sample.duration) / sample.timescale,
          data: sample.data,
        }),
      );
    }
  }

  async flush() {
    if (this.#videoDecoder) {
      await this.#videoDecoder.flush();
      this.#videoDecoder.close();
    }
  }

  static #getDescription(file: ISOFile, trackId: number) {
    const track = file.getTrackById(trackId) as any;
    for (const entry of track.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8); // Remove the box header.
      }
    }
    throw new Error("avcC, hvcC, vpcC, or av1C box not found");
  }
}

export class VideoDecodeStream extends TransformStream<
  ISOFileTrackSamples,
  VideoFrame
> {
  constructor(
    writableStrategy?: QueuingStrategy<ISOFileTrackSamples>,
    readableStrategy?: QueuingStrategy<VideoFrame>,
  ) {
    super(new VideoDecodeTransfomer(), writableStrategy, readableStrategy);
  }
}
