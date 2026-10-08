import { inflateSync as inflate } from 'node:zlib';
export default { inflateSync: (input: Uint8Array) => inflate(input, { maxOutputLength: 64 * 1024 ** 2 }) };
