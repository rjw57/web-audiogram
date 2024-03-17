import {
  ISOFile,
  MP4AudioTrack,
  MP4Track,
  MP4VideoTrack,
  DataStream,
} from "mp4box";

import fetchAndDemuxMedia from "./fetchAndDemuxMedia";

export interface EncodedVideoTrack {
  id: number;
  type: "video";
  decoderConfig: VideoDecoderConfig;
  encodedChunks: EncodedVideoChunk[];
}

export interface EncodedAudioTrack {
  id: number;
  type: "audio";
  decoderConfig: AudioDecoderConfig;
  encodedChunks: EncodedAudioChunk[];
}

export type EncodedTrack = EncodedVideoTrack | EncodedAudioTrack;

/**
 * Stream a response from fetch() demultiplexing the result into tracks of encoded video and audio.
 */
export const fetchIntoEncodedChunks = async (response: Response) => {
  const encodedTracks: EncodedTrack[] = [];
  const encodedTracksById = new Map<number, EncodedTrack>();

  await fetchAndDemuxMedia(response, {
    onInfo: (info, file) => {
      info.tracks.forEach((track) => {
        const encodedTrack = createEncodedTrack(file, track);
        encodedTracks.push(encodedTrack);
        encodedTracksById.set(track.id, encodedTrack);
      });
    },
    onSamples: (track, samples) => {
      const encodedTrack = encodedTracksById.get(track.id);
      if (!encodedTrack) {
        return;
      }

      if (encodedTrack.type === "video") {
        samples.forEach((sample) =>
          encodedTrack.encodedChunks.push(
            new EncodedVideoChunk({
              type: sample.is_sync ? "key" : "delta",
              timestamp: (1e6 * sample.cts) / sample.timescale,
              duration: (1e6 * sample.duration) / sample.timescale,
              data: sample.data,
            }),
          ),
        );
      }

      // TODO: Audio
    },
  });

  return encodedTracks;
};

const createEncodedTrack = (file: ISOFile, track: MP4Track): EncodedTrack => {
  if (Object.hasOwn(track, "video")) {
    const videoTrack = track as MP4VideoTrack;
    return {
      id: videoTrack.id,
      type: "video",
      encodedChunks: [],
      decoderConfig: {
        // Browsers don't yet support parsing full vp8 codec (eg: `vp08.00.41.08`),
        // they only support `vp8`.
        codec: videoTrack.codec.startsWith("vp08") ? "vp8" : videoTrack.codec,
        codedHeight: videoTrack.video.height,
        codedWidth: videoTrack.video.width,
        description: getDescription(file, videoTrack.id),
      },
    };
  }

  if (Object.hasOwn(track, "audio")) {
    const audioTrack = track as MP4AudioTrack;
    return {
      id: audioTrack.id,
      type: "audio",
      encodedChunks: [],
      decoderConfig: {
        codec: audioTrack.codec,
        sampleRate: audioTrack.audio.sample_rate,
        numberOfChannels: audioTrack.audio.channel_count,
      },
    };
  }

  throw new Error(`Track ${track.id} is neither video nor audio.`);
};

const getDescription = (file: ISOFile, track_id: number) => {
  const track = file.getTrackById(track_id) as any;
  for (const entry of track.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8); // Remove the box header.
    }
  }
  throw new Error("avcC, hvcC, vpcC, or av1C box not found");
};

export default fetchIntoEncodedChunks;
