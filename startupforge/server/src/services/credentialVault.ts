import crypto from 'crypto';

function key(): Buffer {
  const configured = process.env.STARTUPFORGE_TOKEN_ENCRYPTION_KEY;
  if (!configured) throw new Error('STARTUPFORGE_TOKEN_ENCRYPTION_KEY is required before connecting GitHub.');
  return crypto.createHash('sha256').update(configured).digest();
}

export function encryptCredential(value: string): string {
  if (!value || value.startsWith('enc:v1:')) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptCredential(value: string): string {
  if (!value || !value.startsWith('enc:v1:')) return value;
  const [, , iv, tag, ciphertext] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
