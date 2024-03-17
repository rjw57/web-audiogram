import { fetchIntoEncodedChunks, EncodedVideoTrack } from "../mp4demux";

/**
 * Wrapper around fetch() which decodes data fetched into an AudioBuffer.
 */
export const fetchAndDecodeAudioData = async (
  sampleRate: number,
  ...args: Parameters<typeof fetch>
) => {
  const response = await fetch(...args);
  if (!response.ok) {
    throw new Error(`Error fetching audio data: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return new Promise<AudioBuffer>((resolve, reject) =>
    new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(
      buffer,
      resolve,
      reject,
    ),
  );
};

/**
 * Wrapper around fetch() which demultiplexes the first video track from an MP4 file.
 */
export const fetchAndDemuxVideo = async (
  ...args: Parameters<typeof fetch>
): Promise<EncodedVideoTrack> => {
  const response = await fetch(...args);
  if (!response.ok) {
    throw new Error(`Error fetching video data: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Video response has no body.");
  }

  const encodedVideoTrack = (await fetchIntoEncodedChunks(response)).filter(
    (encodedTrack) => encodedTrack.type === "video",
  )[0];

  if (!encodedVideoTrack) {
    throw new Error("Media contains no video tracks.");
  }

  return encodedVideoTrack as EncodedVideoTrack;
};
