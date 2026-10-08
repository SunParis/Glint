import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

// Validate untrusted file offsets before the parser allocates a buffer.
export class FileScanner {
  private fd: number;
  private size: number;
  constructor(filename: string) { this.fd = openSync(filename, 'r'); this.size = fstatSync(this.fd).size; }
  readBuffer(offset: number, length: number): Uint8Array {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > 64 * 1024 ** 2 || offset + length > this.size) throw new Error('Invalid dictionary block');
    const buffer = new Uint8Array(length);
    if (readSync(this.fd, buffer, 0, length, offset) !== length) throw new Error('Truncated dictionary');
    return buffer;
  }
  readNumber(offset: number, length: number) { return new DataView(this.readBuffer(offset, length).buffer); }
  close() { if (this.fd >= 0) { closeSync(this.fd); this.fd = -1; } }
}
