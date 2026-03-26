/**
 * C2PA manifest builder using @contentauth/c2pa-node.
 *
 * Wraps the Builder + CallbackSigner/IdentityAssertionSigner API to sign
 * images with a remote signing oracle (the trusthash sidecar).
 *
 * When a wallet private key is provided, the manifest includes a
 * cawg.identity assertion linking the wallet address to the content.
 */

import {
  Builder,
  CallbackSigner,
  CallbackCredentialHolder,
  IdentityAssertionBuilder,
  IdentityAssertionSigner,
  createVerifySettings,
  createTrustSettings,
  mergeSettings,
  settingsToJson,
} from '@contentauth/c2pa-node';
import { encode } from 'cbor2';
import crypto from 'node:crypto';
import { Wallet } from 'ethers';
import { RemoteSigner } from './signer.js';

export interface ManifestSignOptions {
  /** Raw image buffer (JPEG, PNG, etc.). */
  imageBuffer: Buffer;
  /** MIME type of the image. */
  mimeType: string;
  /** The remote signer (calls sidecar /v1/sign). */
  remoteSigner: RemoteSigner;
  /** Claim generator name + version. */
  claimGenerator?: string;
  /** PEM-encoded trust anchor CA cert (for dev — skips C2PA trust list check). */
  trustAnchorPem?: string;
  /** Ethereum private key — if provided, includes cawg.identity assertion. */
  ethPrivateKey?: string;
}

export interface ManifestSignResult {
  /** Image buffer with embedded C2PA manifest. */
  signedBuffer: Buffer;
  /** Raw manifest store bytes (JUMBF). */
  manifestBytes: Buffer;
  /** base64url SHA-256 of the manifest store. */
  manifestStoreHash: string;
}

/**
 * Sign an image with a C2PA manifest using the remote signing oracle.
 *
 * When ethPrivateKey is provided, the manifest includes a cawg.identity
 * assertion with the Ethereum wallet address, verified by the sidecar.
 */
export async function signManifest(options: ManifestSignOptions): Promise<ManifestSignResult> {
  const {
    imageBuffer,
    mimeType,
    remoteSigner,
    claimGenerator = 'turbo-c2pa/0.1.0',
    trustAnchorPem,
    ethPrivateKey,
  } = options;

  // Fetch cert chain from the sidecar
  const certChainPem = await remoteSigner.getCertificateChain();
  const certParts = splitPemChain(certChainPem);

  if (certParts.length === 0) {
    throw new Error('No certificates in the chain from sidecar');
  }

  // Build settings — disable trust verification for dev certs
  const settingsParts = [createVerifySettings({ verifyAfterSign: false, verifyTrust: false })];

  if (trustAnchorPem) {
    settingsParts.push(
      createTrustSettings({ verifyTrustList: false, trustAnchors: trustAnchorPem })
    );
  }

  const settings = mergeSettings(...settingsParts);

  // Build manifest definition
  const manifestDef = {
    claim_generator_info: [
      {
        name: claimGenerator.split('/')[0] || claimGenerator,
        version: claimGenerator.split('/')[1] || '0.1.0',
      },
    ],
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [{ action: 'c2pa.created' }],
        },
      },
    ],
  };

  const builder = Builder.withJson(manifestDef, settingsToJson(settings));
  const input = { buffer: imageBuffer, mimeType };
  const output: { buffer: Buffer | null } = { buffer: null };

  let manifestBytes: Buffer;

  if (ethPrivateKey) {
    // Sign WITH identity assertion
    manifestBytes = await signWithIdentity({
      builder,
      remoteSigner,
      certParts,
      ethPrivateKey,
      input,
      output,
    });
  } else {
    // Sign WITHOUT identity assertion (callback signer only)
    const signerConfig = {
      alg: 'es256' as const,
      certs: certParts.map((pem) => Buffer.from(pem)),
      reserveSize: 20480,
      directCoseHandling: false,
    };

    const rawManifest = await builder.signConfigAsync(
      async (data: Buffer) => {
        const result = await remoteSigner.sign(new Uint8Array(data));
        return Buffer.from(result.signature);
      },
      signerConfig,
      input,
      output
    );
    manifestBytes = Buffer.from(rawManifest);
  }

  if (!output.buffer) {
    throw new Error('c2pa-node did not produce a signed buffer');
  }

  // Compute SHA-256 of the manifest store
  const hash = crypto.createHash('sha256').update(manifestBytes).digest();
  const manifestStoreHash = hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    signedBuffer: output.buffer,
    manifestBytes,
    manifestStoreHash,
  };
}

/**
 * Sign with identity assertion using IdentityAssertionSigner.
 */
async function signWithIdentity(options: {
  builder: Builder;
  remoteSigner: RemoteSigner;
  certParts: string[];
  ethPrivateKey: string;
  input: { buffer: Buffer; mimeType: string };
  output: { buffer: Buffer | null };
}): Promise<Buffer> {
  const { builder, remoteSigner, certParts, ethPrivateKey, input, output } = options;

  // Derive wallet address from private key
  const wallet = new Wallet(ethPrivateKey);
  const walletAddress = wallet.address;

  // Generate wallet ownership proof (signed message)
  const walletMessage = `C2PA identity verification for ${walletAddress} at ${new Date().toISOString()}`;
  const walletSignature = await wallet.signMessage(walletMessage);

  // Create the C2PA manifest signer (CallbackSigner)
  // signAsync with IdentityAssertionSigner requires directCoseHandling: true + DER signatures
  const c2paSigner = CallbackSigner.newSigner(
    {
      alg: 'es256',
      certs: certParts.map((pem) => Buffer.from(pem)),
      reserveSize: 20480,
      directCoseHandling: true,
    },
    async (data: Buffer) => {
      const response = await fetch(`${remoteSigner.endpoint}/v1/sign?format=der`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data,
      });
      if (!response.ok) throw new Error(`Signing failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }
  );

  // Create the identity credential holder (signs identity assertion payloads)
  const credentialHolder = CallbackCredentialHolder.newCallbackCredentialHolder(
    10000,
    'cawg.x509.cose',
    async (signerPayload: unknown) => {
      // CBOR-encode the signer_payload
      const cborBytes = Buffer.from(encode(signerPayload));

      // Send to sidecar for signing with wallet verification
      const endpoint = remoteSigner['endpoint']; // Access private field
      const response = await fetch(`${endpoint}/v1/identity/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: cborBytes.toString('base64'),
          walletAddress,
          walletSignature,
          walletMessage,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Identity signing failed: ${response.status} ${err}`);
      }

      return Buffer.from(await response.arrayBuffer());
    }
  );

  // Build the identity assertion
  const identityBuilder =
    await IdentityAssertionBuilder.identityBuilderForCredentialHolder(credentialHolder);
  identityBuilder.addReferencedAssertions(['c2pa.actions']);
  identityBuilder.addRoles(['cawg.creator']);

  // Create identity signer wrapping the C2PA signer
  const identitySigner = IdentityAssertionSigner.new(c2paSigner.getHandle());
  identitySigner.addIdentityAssertion(identityBuilder);

  // Sign the manifest with identity
  const rawManifest = await builder.signAsync(identitySigner, input, output);

  return Buffer.from(rawManifest);
}

/**
 * Split a PEM string containing multiple certificates into individual PEM blocks.
 */
function splitPemChain(pem: string): string[] {
  const certs: string[] = [];
  const regex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  let match;
  while ((match = regex.exec(pem)) !== null) {
    certs.push(match[0]);
  }
  return certs;
}
