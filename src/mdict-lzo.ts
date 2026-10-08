import { lzo1xDecompress } from 'lzo1x';

// Bundling replaces js-mdict's GPL minilzo wrapper with this MIT implementation.
function decompress(input: Uint8Array, size: number) {
  if (!Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024) throw new Error('Dictionary block too large');
  return lzo1xDecompress(input, size);
}
export default { decompress };
