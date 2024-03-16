// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

declare module "mp4box" {
  type MP4MediaTrack = {
    alternate_group: number;
    bitrate: number;
    codec: string;
    created: Date;
    duration: number;
    id: number;
    language: string;
    layer: number;
    modified: Date;
    movie_duration: number;
    nb_samples: number;
    timescale: number;
    track_height: number;
    track_width: number;
    volume: number;
  };

  type MP4VideoData = {
    height: number;
    width: number;
  };

  type MP4VideoTrack = MP4MediaTrack & {
    video: MP4VideoData;
  };

  type MP4AudioData = {
    channel_count: number;
    sample_rate: number;
    sample_size: number;
  };

  type MP4AudioTrack = MP4MediaTrack & {
    audio: MP4AudioData;
  };

  type MP4Track = MP4VideoTrack | MP4AudioTrack;

  type MP4Info = {
    brands: Array<string>;
    created: Date;
    duration: number;
    fragment_duration: number;
    hasIOD: boolean;
    isFragmented: boolean;
    isProgressive: boolean;
    mime: string;
    modified: Date;
    timescale: number;
    tracks: Array<MP4Track>;
  };

  type MP4SetExtractionOptions = {
    nbSamples: number;
    rapAlignement: boolean;
  };

  type MP4Sample = {
    track_id: number;
    description: string;
    is_rap: boolean;
    is_sync: boolean;
    timescale: number;
    dts: number;
    cts: number;
    duration: number;
    size: number;
    data: Uint8Array;
  };

  export type MP4ArrayBuffer = ArrayBuffer & { fileStart: number };

  export type MP4File<User = any> = {
    appendBuffer(data: MP4ArrayBuffer): number;
    start(): void;
    stop(): void;
    flush(): void;
    setExtractionOptions(
      track_id: number,
      user?: User,
      options?: MP4SetExtractionOptions,
    );
    onError?: (e: string) => void;
    onReady?: (info: MP4Info) => void;
    onSamples?: (track_id: number, user: User, samples: MP4Sample[]) => void;
  };

  export function createFile(): MP4File;

  export var DataStream: {
    BIG_ENDIAN: boolean;
    new (
      arrayBuffer?: ArrayBuffer,
      offset: number,
      endian: boolean,
    ): DataStream;
    buffer: ArrayBuffer;
  };
}
