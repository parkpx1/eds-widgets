/*
 * A minimal ZIP writer, store-only.
 *
 * The download button needs to hand over three or four small text files as one
 * artefact. Pulling in a compression library for that would mean a dependency and
 * a build step, and this repository has neither by design — so the container is
 * written by hand.
 *
 * Entries are stored uncompressed. For a few kilobytes of source, DEFLATE would
 * save almost nothing and would require either a bundled implementation or
 * CompressionStream plumbing; the point of the download is that the files are
 * readable, not that they are small.
 *
 * Format reference: PKWARE APPNOTE, sections 4.3.7 (local header), 4.3.12
 * (central directory) and 4.3.16 (end of central directory). All fields are
 * little-endian.
 */

/* eslint-disable no-bitwise -- CRC-32 and the ZIP headers are bit-level formats. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP inherited MS-DOS packed time and date, which is why 1980 is the epoch. */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xffff, date: day & 0xffff };
}

/**
 * Builds a ZIP archive.
 * @param {{name: string, text: string}[]} files Entries to store.
 * @returns {Blob} The archive, ready to hand to a download link.
 */
export default function zip(files) {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(new Date());

  const entries = files.map((file) => {
    const nameBytes = encoder.encode(file.name);
    const body = encoder.encode(file.text);
    return { nameBytes, body, crc: crc32(body) };
  });

  const localSize = entries.reduce((n, e) => n + 30 + e.nameBytes.length + e.body.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  const buffer = new ArrayBuffer(localSize + centralSize + 22);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  const u16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const u32 = (value) => { view.setUint32(offset, value, true); offset += 4; };
  const raw = (chunk) => { bytes.set(chunk, offset); offset += chunk.length; };

  entries.forEach((entry) => {
    entry.offset = offset;
    u32(0x04034b50);
    u16(20); // version needed
    u16(0x0800); // flag bit 11: names are UTF-8
    u16(0); // stored, not deflated
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.body.length); // compressed size == uncompressed when stored
    u32(entry.body.length);
    u16(entry.nameBytes.length);
    u16(0); // no extra field
    raw(entry.nameBytes);
    raw(entry.body);
  });

  const centralStart = offset;
  entries.forEach((entry) => {
    u32(0x02014b50);
    u16(20); // version made by
    u16(20); // version needed
    u16(0x0800);
    u16(0);
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.body.length);
    u32(entry.body.length);
    u16(entry.nameBytes.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(entry.offset);
    raw(entry.nameBytes);
  });

  /*
   * Captured before the end-of-central-directory record is written. Reading the
   * live `offset` here instead reports a directory 12 bytes longer than it is —
   * the size of the EOCD fields emitted before this value is reached — which
   * unzip flags as "missing 12 bytes in zipfile".
   */
  const centralDirectorySize = offset - centralStart;

  u32(0x06054b50);
  u16(0); // this disk
  u16(0); // disk holding the central directory
  u16(entries.length);
  u16(entries.length);
  u32(centralDirectorySize);
  u32(centralStart);
  u16(0); // archive comment

  return new Blob([buffer], { type: 'application/zip' });
}
