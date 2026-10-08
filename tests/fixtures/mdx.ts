import { deflateSync } from 'node:zlib';
import { lzo1xCompress } from 'lzo1x';

// Original synthetic MDX v2 data: no redistributed third-party dictionary content.
export function mdxFixture(name = 'Glint 测试词典', lzo = false, version = 2): Buffer {
  const num = (value: number, size = version >= 2 ? 8 : 4) => { const b = Buffer.alloc(size); if (size === 8) b.writeBigUInt64BE(BigInt(value)); else b.writeUIntBE(value, 0, size); return b; };
  const adler = (data: Buffer) => { let a = 1, b = 0; for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; } return num(((b << 16) | a) >>> 0, 4); };
  const pack = (data: Buffer, useLzo = lzo) => Buffer.concat([Buffer.from([useLzo ? 1 : 2, 0, 0, 0]), adler(data), useLzo ? Buffer.from(lzo1xCompress(data)) : deflateSync(data)]);
  const rows = [
    ['apple', '<head><style>hidden</style></head><div>自定义苹果 &amp; 例句</div><script>window.pwned=true</script><p>第二行</p>'],
    ['apples', '@@@LINK=apple'], ['cycle', '@@@LINK=cycle'], ['zebra', '<p>最后的斑马。</p>']
  ];
  let offset = 0;
  const keys: Buffer[] = [], records: Buffer[] = [];
  for (const [word, definition] of rows) {
    keys.push(num(offset), Buffer.from(word + '\0'));
    const record = Buffer.from(definition + '\0'); records.push(record); offset += record.length;
  }
  const rawKeys = Buffer.concat(keys), packedKeys = pack(rawKeys);
  const term = version >= 2 ? '\0' : '';
  const info = Buffer.concat([num(rows.length), num(rows[0][0].length, version >= 2 ? 2 : 1), Buffer.from(rows[0][0] + term), num(rows.at(-1)![0].length, version >= 2 ? 2 : 1), Buffer.from(rows.at(-1)![0] + term), num(packedKeys.length), num(rawKeys.length)]);
  const packedInfo = version >= 2 ? pack(info, false) : info;
  const header = Buffer.from(`<Dictionary GeneratedByEngineVersion="${version}" RequiredEngineVersion="${version}" Encrypted="0" Encoding="UTF-8" Format="Html" Title="${name}" KeyCaseSensitive="No" StripKey="No"/>\0`, 'utf16le');
  const keyHeader = Buffer.concat([num(1), num(rows.length), ...(version >= 2 ? [num(info.length)] : []), num(packedInfo.length), num(packedKeys.length)]);
  const rawRecords = Buffer.concat(records);
  const recordBlocks = [rawRecords.subarray(0, 39), rawRecords.subarray(39)]; // Split inside an entry, including UTF-8 bytes.
  const packedRecords = recordBlocks.map(value => pack(value));
  const recordInfo = Buffer.concat(recordBlocks.flatMap((value, index) => [num(packedRecords[index].length), num(value.length)]));
  return Buffer.concat([num(header.length, 4), header, adler(header), keyHeader, ...(version >= 2 ? [adler(keyHeader)] : []), packedInfo, packedKeys,
    num(recordBlocks.length), num(rows.length), num(recordInfo.length), num(packedRecords.reduce((total, b) => total + b.length, 0)), recordInfo, ...packedRecords]);
}
