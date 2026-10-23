import crypto from 'node:crypto';

// Configuration keys from environment or robust fallbacks
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const JWT_SECRET = process.env.JWT_SECRET || 'saiman_burtan_super_secure_jwt_secret_key_at_least_32_bytes_long';
const IP_HASH_SALT = process.env.IP_HASH_SALT || 'saiman_burtan_ip_privacy_salt_2026';

// 32-byte key buffer for AES-256-GCM
function getAesKey(): Buffer {
  if (TOKEN_ENCRYPTION_KEY.length === 64) {
    return Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex');
  }
  return crypto.createHash('sha256').update(TOKEN_ENCRYPTION_KEY).digest();
}

/**
 * Encrypt sensitive OAuth tokens (e.g. refresh token) using AES-256-GCM
 * Returns formatted string: ivHex:authTagHex:ciphertextHex
 */
export function encryptToken(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt tokens using AES-256-GCM
 */
export function decryptToken(encryptedPayload: string): string | null {
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt token:', err);
    return null;
  }
}

/**
 * Hash password using scrypt (Node native cryptographically secure password derivation)
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify password with timingSafeEqual
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return resolve(false);

    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const keyBuffer = Buffer.from(key, 'hex');
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Anonymize visitor IP with salted SHA-256 hash (never storing raw PII in compliance with GDPR/Anti-cheat)
 */
export function hashIp(ip: string): string {
  return crypto
    .createHmac('sha256', IP_HASH_SALT)
    .update(ip || '127.0.0.1')
    .digest('hex')
    .slice(0, 32);
}

/**
 * Lightweight browser/device fingerprint hash (hashed IP + User-Agent)
 */
export function getFingerprintHash(ip: string, userAgent: string): string {
  return crypto
    .createHmac('sha256', IP_HASH_SALT)
    .update(`${ip}:${userAgent || ''}`)
    .digest('hex');
}

/**
 * Cryptographic random string generator (nonces, state parameters, PKCE code verifiers)
 */
export function generateRandomString(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * PKCE Code Challenge generator for OAuth 2.0 (RFC 7636)
 */
export function generatePkceChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

/**
 * Sign JWT-like authenticated token (HS256)
 */
export function signJwt(payload: Record<string, any>, expiresInSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = { ...payload, exp };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${bodyB64}`)
    .digest('base64url');

  return `${headerB64}.${bodyB64}.${signature}`;
}

/**
 * Verify and decode JWT token
 */
export function verifyJwt<T = Record<string, any>>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const body = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return body as T;
  } catch {
    return null;
  }
}
