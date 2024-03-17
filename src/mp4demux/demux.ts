import { ISOFile, MP4Info, MP4Track, Sample, createFile } from "mp4box";

export interface DemuxOptions {
  onInfo?: (info: MP4Info, file: ISOFile) => void;
  onSamples?: (track: MP4Track, samples: Sample[], file: ISOFile) => void;
}

export type AppendBuffersCallback = (file: ISOFile) => Promise<any>;

const DEMUX_OPTIONS_DEFAULTS = {
  onInfo: () => {},
  onSamples: () => {},
};

export const demux = async (
  appendBuffers: AppendBuffersCallback,
  options?: DemuxOptions,
) => {
  const { onInfo, onSamples } = {
    ...DEMUX_OPTIONS_DEFAULTS,
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

  await appendBuffers(file);

  return file;
};

export default demux;
