import { Builder, LocalSigner } from '@contentauth/c2pa-node';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

async function main() {
  // Load certificate and key
  const certPath = './certs/certificate.pem';
  const keyPath = './certs/private-key.pem';

  const certificate = await readFile(certPath);
  const privateKey = await readFile(keyPath);

  console.log('Creating signer...');
  const signer = LocalSigner.newSigner(certificate, privateKey, 'es256');
  console.log('Signer created');

  // Create builder with minimal manifest (no special settings needed now with proper cert chain)
  console.log('Creating builder...');
  const builder = Builder.withJson({
    claim_generator: 'Test/1.0.0',
    title: 'Test Image',
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [{ action: 'c2pa.created' }],
        },
      },
    ],
  });
  console.log('Builder created');

  // Use the test image
  const testImage = './tests/fixtures/c2pa-sample.jpg';
  const tempOutput = join(tmpdir(), 'test-output.jpg');

  console.log('Input:', testImage);
  console.log('Output:', tempOutput);
  console.log('Signing...');

  try {
    const result = builder.sign(signer, { path: testImage }, { path: tempOutput });
    console.log('Sign result:', result?.length, 'bytes');

    // Read result
    const signed = await readFile(tempOutput);
    console.log('Signed file size:', signed.length, 'bytes');

    // Cleanup
    await unlink(tempOutput).catch(() => {});

    console.log('SUCCESS!');
  } catch (e) {
    console.error('Error:', e);
  }
}

main();
