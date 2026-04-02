import type { StorageAdapter, S3AdapterConfig } from '../types.js';

/** Minimal S3Client interface to avoid compile-time AWS SDK dependency. */
interface MinimalS3Client {
  send(command: unknown): Promise<{ Body?: AsyncIterable<Uint8Array> }>;
}

/**
 * S3 storage adapter for enterprise evidence storage.
 *
 * Uses the AWS SDK v3 for S3 operations. The AWS SDK must be
 * installed separately as an optional peer dependency:
 *
 *   npm install @aws-sdk/client-s3
 */
export class S3StorageAdapter implements StorageAdapter {
  private config: S3AdapterConfig;
  private client: MinimalS3Client | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private s3Module: any = null;

  constructor(config: S3AdapterConfig) {
    this.config = config;
  }

  private resolveKey(key: string): string {
    return this.config.prefix ? `${this.config.prefix}/${key}` : key;
  }

  private async ensureClient(): Promise<{ client: MinimalS3Client; mod: any }> {
    if (this.client && this.s3Module) {
      return { client: this.client, mod: this.s3Module };
    }

    const moduleName = '@aws-sdk/client-s3';
    try {
      this.s3Module = await import(/* webpackIgnore: true */ moduleName);
    } catch {
      throw new Error(
        'S3StorageAdapter requires @aws-sdk/client-s3. Install it: npm install @aws-sdk/client-s3'
      );
    }

    this.client = new this.s3Module.S3Client({
      region: this.config.region,
      ...(this.config.endpoint && { endpoint: this.config.endpoint }),
      ...(this.config.credentials && { credentials: this.config.credentials }),
    }) as MinimalS3Client;

    return { client: this.client, mod: this.s3Module };
  }

  async retrieve(key: string): Promise<Buffer> {
    const { client, mod } = await this.ensureClient();

    const response = await client.send(
      new mod.GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.resolveKey(key),
      })
    );

    if (!response.Body) {
      throw new Error(`Empty response for key: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async store(key: string, data: Buffer | Uint8Array): Promise<string> {
    const { client, mod } = await this.ensureClient();

    await client.send(
      new mod.PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.resolveKey(key),
        Body: data,
      })
    );
    return key;
  }

  async exists(key: string): Promise<boolean> {
    const { client, mod } = await this.ensureClient();

    try {
      await client.send(
        new mod.HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.resolveKey(key),
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
