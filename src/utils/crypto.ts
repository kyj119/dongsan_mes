// PBKDF2-SHA256 기반 비밀번호 해싱
// 포맷: pbkdf2:iterations:salt_hex:hash_hex
// Cloudflare Workers Web Crypto API 사용 (bcrypt 불가)

const ITERATIONS = 100000
const KEY_LENGTH = 32 // bytes
const SALT_LENGTH = 16 // bytes

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial, KEY_LENGTH * 8
  )
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`
}

// ============================================================================
// AES-256-GCM 개인정보 암호화 (주민등록번호 등)
// 포맷: aes:iv_hex:ciphertext_hex:tag_hex
// ============================================================================
const AES_IV_LENGTH = 12 // bytes (GCM 권장)

async function getAESKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('dongsan-pii-salt'), iterations: 10000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

export async function encryptPII(plaintext: string, secret: string): Promise<string> {
  if (!plaintext || !secret) return plaintext
  if (plaintext.startsWith('aes:')) return plaintext // 이미 암호화됨
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH))
  const key = await getAESKey(secret)
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(plaintext)
  )
  const buf = new Uint8Array(encrypted)
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  const dataHex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
  return `aes:${ivHex}:${dataHex}`
}

export async function decryptPII(ciphertext: string, secret: string): Promise<string> {
  if (!ciphertext || !secret) return ciphertext
  if (!ciphertext.startsWith('aes:')) return ciphertext // 평문 (레거시)
  const [, ivHex, dataHex] = ciphertext.split(':')
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const data = new Uint8Array(dataHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const key = await getAESKey(secret)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, data
  )
  return new TextDecoder().decode(decrypted)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // 레거시 평문 비밀번호 지원 (pbkdf2: 프리픽스 없으면 평문으로 간주)
  if (!stored.startsWith('pbkdf2:')) {
    return password === stored
  }
  const [, iterStr, saltHex, expectedHashHex] = stored.split(':')
  const iterations = parseInt(iterStr)
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, KEY_LENGTH * 8
  )
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex === expectedHashHex
}
