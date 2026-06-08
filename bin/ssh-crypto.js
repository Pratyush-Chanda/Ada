// ===== SSH-STYLE CRYPTOGRAPHIC UTILITIES =====
// Uses Web Crypto API for RSA key generation and challenge-response authentication

const SSH_CONFIG = {
  algorithm: {
    name: 'RSA-PSS',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  },
  signParams: {
    name: 'RSA-PSS',
    saltLength: 32
  }
};

// ===== KEY GENERATION =====
async function generateKeyPair() {
  try {
    const keyPair = await crypto.subtle.generateKey(
      SSH_CONFIG.algorithm,
      true, // extractable
      ['sign', 'verify']
    );
    
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    
    // Convert to PEM-like format for SSH familiarity
    const privateKeyPem = jwkToPem(privateKeyJwk, 'PRIVATE');
    const publicKeyPem = jwkToPem(publicKeyJwk, 'PUBLIC');
    
    // Generate fingerprint (SHA-256 hash of public key)
    const fingerprint = await generateFingerprint(publicKeyJwk);
    
    return {
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      privateKeyJwk,
      publicKeyJwk,
      fingerprint
    };
  } catch (error) {
    console.error('Key generation failed:', error);
    throw new Error('Failed to generate key pair');
  }
}

// ===== PEM ENCODING/DECODING =====
function jwkToPem(jwk, type) {
  const base64 = btoa(JSON.stringify(jwk));
  const chunks = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${type} KEY-----\n${chunks.join('\n')}\n-----END ${type} KEY-----`;
}

function pemToJwk(pem) {
  const lines = pem.split('\n');
  const base64Lines = lines.filter(line => 
    !line.startsWith('-----BEGIN') && !line.startsWith('-----END') && line.trim()
  );
  const base64 = base64Lines.join('');
  return JSON.parse(atob(base64));
}

// ===== FINGERPRINT GENERATION =====
async function generateFingerprint(publicKeyJwk) {
  const keyString = JSON.stringify(publicKeyJwk);
  const encoder = new TextEncoder();
  const data = encoder.encode(keyString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // Format as SSH-style fingerprint (e.g., SHA256:abc123...)
  const base64Hash = btoa(String.fromCharCode(...hashArray));
  return `SHA256:${base64Hash.replace(/=+$/, '').slice(0, 43)}`;
}

// ===== HASH PUBLIC KEY FOR STORAGE =====
// We hash only the RSA modulus (n) so the hash is identical whether
// derived from the public key directly or reconstructed from the private key.
async function hashPublicKey(publicKeyPem) {
  const jwk = pemToJwk(publicKeyPem);
  // Use only the modulus (n) — stable across all derivation paths
  const encoder = new TextEncoder();
  const data = encoder.encode(jwk.n);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== CHALLENGE-RESPONSE AUTHENTICATION =====
async function signChallenge(privateKeyPem, challenge) {
  try {
    const privateKeyJwk = pemToJwk(privateKeyPem);
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      SSH_CONFIG.algorithm,
      false,
      ['sign']
    );
    
    const encoder = new TextEncoder();
    const data = encoder.encode(challenge);
    const signature = await crypto.subtle.sign(
      SSH_CONFIG.signParams,
      privateKey,
      data
    );
    
    // Return base64-encoded signature
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  } catch (error) {
    console.error('Signing failed:', error);
    throw new Error('Failed to sign challenge');
  }
}

async function verifySignature(publicKeyPem, challenge, signatureBase64) {
  try {
    const publicKeyJwk = pemToJwk(publicKeyPem);
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      SSH_CONFIG.algorithm,
      false,
      ['verify']
    );
    
    const encoder = new TextEncoder();
    const data = encoder.encode(challenge);
    const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    
    return await crypto.subtle.verify(
      SSH_CONFIG.signParams,
      publicKey,
      signature,
      data
    );
  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}

// ===== DERIVE PUBLIC KEY FROM PRIVATE =====
async function derivePublicKey(privateKeyPem) {
  try {
    const privateKeyJwk = pemToJwk(privateKeyPem);
    
    // Extract public key components from private key JWK
    const publicKeyJwk = {
      kty: privateKeyJwk.kty,
      n: privateKeyJwk.n,
      e: privateKeyJwk.e,
      alg: privateKeyJwk.alg,
      ext: true,
      key_ops: ['verify']
    };
    
    return jwkToPem(publicKeyJwk, 'PUBLIC');
  } catch (error) {
    console.error('Public key derivation failed:', error);
    throw new Error('Failed to derive public key');
  }
}

// ===== GENERATE RANDOM CHALLENGE =====
function generateChallenge() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ===== SESSION TOKEN GENERATION =====
function generateSessionToken() {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ===== EXPORT FOR MODULE USE =====
if (typeof window !== 'undefined') {
  window.SSHCrypto = {
    generateKeyPair,
    signChallenge,
    verifySignature,
    derivePublicKey,
    hashPublicKey,
    generateChallenge,
    generateSessionToken,
    generateFingerprint,
    jwkToPem,
    pemToJwk
  };
}