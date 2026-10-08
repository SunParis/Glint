import { MDX } from 'js-mdict';
import zlib from './mdict-zlib';
import lzo from './mdict-lzo';

export class MdictReader extends MDX {
  private cached?: { index: number; bytes: Uint8Array };
  // Upstream slices only the first block and leaves the last entry end at -1.
  // Join cross-block records and derive the final end from the record table.
  override lookupRecordByKeyBlock(item: { recordStartOffset: number; recordEndOffset: number }): Uint8Array {
    const last = this.recordInfoList.at(-1)!;
    const end = item.recordEndOffset < 0 ? last.unpackAccumulatorOffset + last.unpackSize : item.recordEndOffset;
    const start = item.recordStartOffset;
    if (end < start || end - start > 1_000_000) throw new Error('Invalid entry size');
    const output = new Uint8Array(end - start);
    let copied = 0;
    for (let index = 0; index < this.recordInfoList.length; index++) {
      const info = this.recordInfoList[index], blockEnd = info.unpackAccumulatorOffset + info.unpackSize;
      if (blockEnd <= start) continue;
      if (info.unpackAccumulatorOffset >= end) break;
      let bytes = this.cached?.index === index ? this.cached.bytes : undefined;
      if (!bytes) {
        if (info.unpackSize > 64 * 1024 ** 2) throw new Error('Dictionary block too large');
        const packed = this.scanner.readBuffer(this._recordBlockStartOffset + info.packAccumulateOffset, info.packSize);
        const type = new DataView(packed.buffer, packed.byteOffset, packed.byteLength).getUint32(0, true);
        bytes = type === 0 ? packed.slice(8) : type === 1 ? lzo.decompress(packed.slice(8), info.unpackSize) : type === 2 ? zlib.inflateSync(packed.slice(8)) : undefined;
        if (!bytes || bytes.length !== info.unpackSize) throw new Error('Invalid dictionary compression');
        this.cached = { index, bytes };
      }
      const part = bytes.subarray(Math.max(0, start - info.unpackAccumulatorOffset), Math.min(info.unpackSize, end - info.unpackAccumulatorOffset));
      output.set(part, copied); copied += part.length;
    }
    if (copied !== output.length) throw new Error('Truncated entry');
    return output;
  }
}
