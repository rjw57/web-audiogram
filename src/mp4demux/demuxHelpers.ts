import { MP4ArrayBuffer } from "mp4box";

import ISOFileSink from "./ISOFileSink";
import demuxIntoEncodedChunks from "./demuxIntoEncodedChunks";

export const demuxResponseIntoEncodedChunks = (response: Response) =>
  demuxIntoEncodedChunks(async (file) => {
    if (response.body) {
      await response.body.pipeTo(
        new WritableStream(new ISOFileSink(file), { highWaterMark: 2 }),
      );
    }
  });

export const demuxArrayBufferIntoEncodedChunks = (buffer: ArrayBuffer) =>
  demuxIntoEncodedChunks(async (file) => {
    const mp4Buffer = buffer as MP4ArrayBuffer;
    mp4Buffer.fileStart = 0;
    file.appendBuffer(mp4Buffer);
    file.flush();
  });
