const crypto = require('crypto');

function key() {
    const configured = process.env.TOKEN_ENCRYPTION_KEY;
    if (!configured) throw new Error('TOKEN_ENCRYPTION_KEY is required before connecting external accounts');
    return crypto.createHash('sha256').update(configured).digest();
}

function encryptSecret(value) {
    if (!value || String(value).startsWith('enc:v1:')) return value;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptSecret(value) {
    if (!value || !String(value).startsWith('enc:v1:')) return value;
    const [, , iv, tag, ciphertext] = String(value).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
