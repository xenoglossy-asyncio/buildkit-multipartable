// Minimal tar builder in the browser.
// Creates a ustar-format tar archive, gzip compressed, from an array of {name, data} entries.

interface TarEntry {
  name: string;
  data: Uint8Array;
}

export async function buildTarGz(entries: TarEntry[]): Promise<Uint8Array> {
  const tar = buildTar(entries);

  // Gzip compress using browser CompressionStream API
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  writer.write(tar as BufferSource);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result;
}

export function buildTar(entries: TarEntry[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const header = new Uint8Array(512);
    header.fill(0);

    // name (100 bytes)
    const nameBytes = encoder.encode(entry.name);
    header.set(nameBytes.slice(0, 99), 0);

    // mode: 0000644
    encoder.encode("0000644\0").forEach((b, i) => (header[100 + i] = b));

    // uid / gid: 0000000
    encoder.encode("0000000\0").forEach((b, i) => {
      header[108 + i] = b;
      header[116 + i] = b;
    });

    // size (12 bytes, octal)
    const sizeOct = entry.data.length.toString(8).padStart(11, "0") + "\0";
    encoder.encode(sizeOct).forEach((b, i) => (header[124 + i] = b));

    // mtime (12 bytes): 0
    encoder.encode("00000000000\0").forEach((b, i) => (header[136 + i] = b));

    // typeflag: '0' = regular file
    header[156] = 48; // '0'

    // magic: "ustar\0"
    encoder.encode("ustar\0").forEach((b, i) => (header[257 + i] = b));

    // version: "00"
    header[263] = 48;
    header[264] = 48;

    // checksum (8 bytes): fill with spaces, compute, write octal + null + space
    for (let i = 148; i < 156; i++) header[i] = 32;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    const chkOct = sum.toString(8).padStart(6, "0") + "\0 ";
    encoder.encode(chkOct).forEach((b, i) => (header[148 + i] = b));

    blocks.push(header);

    // data padded to 512-byte blocks
    const paddedLen = Math.ceil(entry.data.length / 512) * 512;
    const dataBlock = new Uint8Array(paddedLen);
    dataBlock.set(entry.data);
    blocks.push(dataBlock);
  }

  // end-of-archive marker: two 512-byte zero blocks
  const endMarker = new Uint8Array(1024);
  endMarker.fill(0);
  blocks.push(endMarker);

  // combine
  const totalSize = blocks.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const b of blocks) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
}

// Recursively read all files from a drop event's webkitGetAsEntry.
export async function readFolder(entry: FileSystemEntry): Promise<TarEntry[]> {
  const result: TarEntry[] = [];
  await collectEntries(entry, "", result);
  return result;
}

async function collectEntries(
  entry: FileSystemEntry,
  prefix: string,
  result: TarEntry[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve),
    );
    const buf = new Uint8Array(await file.arrayBuffer());
    const name = prefix + file.name;
    if (name.startsWith("/")) {
      result.push({ name: name.slice(1), data: buf });
    } else {
      result.push({ name, data: buf });
    }
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve) =>
      dirReader.readEntries(resolve),
    );
    const dirName = prefix + entry.name + "/";
    for (const child of entries) {
      await collectEntries(child, dirName, result);
    }
  }
}
