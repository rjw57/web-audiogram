import { ISOFile, MP4ArrayBuffer } from "mp4box";

/**
 * Wrap an ISOFile as a WritableStream underlying sink.
 *
 * Adapted from: https://github.com/w3c/webcodecs/blob/667c795ce308bcec5f900e3e3e299f355d852329/samples/video-decode-display/demuxer_mp4.js
 */
export class ISOFileSink implements UnderlyingSink {
  #file: ISOFile;
  #offset = 0;

  constructor(file: ISOFile) {
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

export default ISOFileSink;
