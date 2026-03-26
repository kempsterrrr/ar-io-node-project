export class SizeLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SizeLimitError';
  }
}

export async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Buffer> {
  if (!stream) {
    return Buffer.alloc(0);
  }

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // best-effort cancel
      }
      throw new SizeLimitError('Content size exceeds configured limit');
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, total);
}
