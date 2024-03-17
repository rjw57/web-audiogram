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
 * Wrapper around fetch() which returns an ArrayBuffer of the response.
 */
export const fetchIntoArrayBuffer = async (
  ...args: Parameters<typeof fetch>
) => {
  const response = await fetch(...args);
  if (!response.ok) {
    throw new Error(`Error fetching data: ${response.statusText}`);
  }
  return response.arrayBuffer();
};
