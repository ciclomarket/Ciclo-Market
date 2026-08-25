const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey() {
  const raw = String(process.env.APP_ENCRYPTION_KEY || '').trim()
  if (!raw) throw new Error('APP_ENCRYPTION_KEY no configurado')
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY debe representar 32 bytes (hex de 64 chars o base64)')
  return key
}

function encryptSecret(plainText) {
  if (plainText == null) return null
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

function decryptSecret(payloadB64) {
  if (payloadB64 == null) return null
  const key = getKey()
  const buf = Buffer.from(String(payloadB64), 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16)
  const encrypted = buf.subarray(IV_LENGTH + 16)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

module.exports = { encryptSecret, decryptSecret }
