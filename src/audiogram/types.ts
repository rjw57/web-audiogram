export const SET_ENCODED_MEDIA: unique symbol = Symbol("SET_ENCODED_MEDIA");

export interface SetEncodedMediaMessage {
  type: typeof SET_ENCODED_MEDIA;
  encodedMedia: ArrayBuffer;
}
