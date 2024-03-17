import { ISOFile, MP4Info, MP4Track, Sample, createFile } from "mp4box";

import ISOFileSink from "./ISOFileSink";

export interface FetchAndDemuxMediaOptions {
  onInfo?: (info: MP4Info, file: ISOFile) => void;
  onSamples?: (track: MP4Track, samples: Sample[], file: ISOFile) => void;
}

const FETCH_AND_DEMUX_MEDIA_OPTIONS_DEFAULTS = {
  onInfo: () => {},
  onSamples: () => {},
};

/**
 * Given a response from a call to fetch(), stream and demux all tracks.
 */
export const fetchAndDemuxMedia = async (
  response: Response,
  options?: FetchAndDemuxMediaOptions,
) => {
  const { onInfo, onSamples } = {
    ...FETCH_AND_DEMUX_MEDIA_OPTIONS_DEFAULTS,
    ...options,
  };
  const file = createFile();
  const tracksById = new Map<number, MP4Track>();

  file.onError = (e: string) => {
    throw new Error(`Error demuxing media: ${e}`);
  };

  file.onReady = (info) => {
    info.tracks.forEach((track) => {
      tracksById.set(track.id, track);
      file.setExtractionOptions(track.id);
    });
    onInfo(info, file);
    file.start();
  };

  file.onSamples = (track_id, _user, samples) => {
    const track = tracksById.get(track_id) ?? null;
    if (track === null) {
      return;
    }
    onSamples(track, samples, file);
  };

  if (response.body) {
    await response.body.pipeTo(
      new WritableStream(new ISOFileSink(file), { highWaterMark: 2 }),
    );
  }

  return file;
};

export default fetchAndDemuxMedia;
