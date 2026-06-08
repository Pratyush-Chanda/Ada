// ===== SSH-STYLE AUTHENTICATION SYSTEM =====
// Browser-based public key authentication with challenge-response
// Users/admins are persisted server-side via /api/ssh (Vercel KV).
// localStorage is only used for session restoration (24h token).

const SSH_SESSION_KEY = 'nb_ssh_session';

let sshSession = null;

// ===== INITIALIZATION =====
async function initSSHAuth() {
  restoreSSHSession();
  updateSSHAuthUI();
}

// ===== SERVER PROXY =====
// All user/admin records live in Vercel KV, accessed through /api/ssh.
async function sshProxy(action, payload = {}) {
  try {
    const r = await fetch('/api/ssh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data.error || `SSH proxy error (${r.status})` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ===== SESSION MANAGEMENT =====
// Sessions are stored in sessionStorage only (tab-scoped, no server round-trip on reload).
function restoreSSHSession() {
  try {
    const stored = sessionStorage.getItem(SSH_SESSION_KEY);
    if (stored) {
      const session = JSON.parse(stored);
      if (session.expiresAt && Date.now() < session.expiresAt) {
        sshSession = session;
      } else {
        sessionStorage.removeItem(SSH_SESSION_KEY);
      }
    }
  } catch (e) {
    sshSession = null;
  }
}

function setSSHSession(user) {
  sshSession = {
    ...user,
    token: SSHCrypto.generateSessionToken(),
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000)
  };
  sessionStorage.setItem(SSH_SESSION_KEY, JSON.stringify(sshSession));
}

function clearSSHSession() {
  sshSession = null;
  sessionStorage.removeItem(SSH_SESSION_KEY);
}

// ===== REGISTRATION =====
async function registerSSHUser(username) {
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }

  // Check uniqueness server-side
  const check = await sshProxy('checkUsername', { username });
  if (!check.ok) throw new Error(check.error);
  if (check.data.taken) throw new Error('Username already registered');

  // Generate key pair locally — private key never leaves the browser
  const keyPair = await SSHCrypto.generateKeyPair();
  const publicKeyHash = await SSHCrypto.hashPublicKey(keyPair.publicKey);

  const result = await sshProxy('register', {
    username,
    publicKey: keyPair.publicKey,
    publicKeyHash,
    fingerprint: keyPair.fingerprint,
    role: 'user'
  });
  if (!result.ok) throw new Error(result.error);

  return {
    privateKey: keyPair.privateKey,
    fingerprint: keyPair.fingerprint,
    username
  };
}

// ===== ADMIN REGISTRATION =====
async function registerSSHAdmin(username, permissions = ['create', 'delete', 'modify', 'approve']) {
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }

  const keyPair = await SSHCrypto.generateKeyPair();
  const publicKeyHash = await SSHCrypto.hashPublicKey(keyPair.publicKey);

  const result = await sshProxy('register', {
    username,
    publicKey: keyPair.publicKey,
    publicKeyHash,
    fingerprint: keyPair.fingerprint,
    role: 'admin',
    permissions
  });
  if (!result.ok) throw new Error(result.error);

  return {
    privateKey: keyPair.privateKey,
    fingerprint: keyPair.fingerprint,
    username
  };
}

// ===== LOGIN =====
async function loginWithSSHKey(privateKeyPem) {
  try {
    // Derive public key hash from private key (all client-side)
    const publicKey = await SSHCrypto.derivePublicKey(privateKeyPem);
    const publicKeyHash = await SSHCrypto.hashPublicKey(publicKey);

    // Look up user record from server by key hash
    const lookup = await sshProxy('lookup', { publicKeyHash });
    if (!lookup.ok) throw new Error('Key not recognized. Please register first.');

    const user = lookup.data.user;

    // Challenge-response: sign a server-issued nonce with the private key,
    // then verify it locally against the stored public key.
    const challenge = SSHCrypto.generateChallenge();
    const signature = await SSHCrypto.signChallenge(privateKeyPem, challenge);
    const isValid = await SSHCrypto.verifySignature(user.publicKey, challenge, signature);

    if (!isValid) throw new Error('Challenge verification failed. Invalid key.');

    // Log the login event server-side
    await sshProxy('logEvent', {
      action: 'login',
      username: user.username,
      fingerprint: user.fingerprint
    });

    setSSHSession({
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions || [],
      fingerprint: user.fingerprint
    });

    updateSSHAuthUI();

    return { success: true, username: user.username, role: user.role };
  } catch (error) {
    throw new Error(error.message || 'Login failed');
  }
}

// ===== LOGOUT =====
function logoutSSH() {
  clearSSHSession();
  updateSSHAuthUI();
}

// ===== AUTH CHECKS =====
function isSSHLoggedIn() { return sshSession !== null; }
function isSSHAdmin() { return sshSession?.role === 'admin' || sshSession?.role === 'superadmin'; }
function hasSSHPermission(permission) { return sshSession?.permissions?.includes(permission); }
function getSSHSession() { return sshSession; }

// ===== ADMIN FUNCTIONS =====
// These call the server — only admins should be able to call them
// (enforce this in /api/ssh using a session token check).

async function getSSHUsers() {
  const res = await sshProxy('listUsers');
  return res.ok ? res.data.users : [];
}

async function getSSHAdmins() {
  const res = await sshProxy('listAdmins');
  return res.ok ? res.data.admins : [];
}

async function revokeSSHUser(userId) {
  const res = await sshProxy('revoke', { userId, role: 'user' });
  if (!res.ok) throw new Error(res.error);
}

async function revokeSSHAdmin(adminId) {
  const res = await sshProxy('revoke', { userId: adminId, role: 'admin' });
  if (!res.ok) throw new Error(res.error);
}

// ===== KEY ROTATION =====
async function rotateAdminKey(adminId) {
  const keyPair = await SSHCrypto.generateKeyPair();
  const publicKeyHash = await SSHCrypto.hashPublicKey(keyPair.publicKey);

  const res = await sshProxy('rotateKey', {
    userId: adminId,
    publicKey: keyPair.publicKey,
    publicKeyHash,
    fingerprint: keyPair.fingerprint
  });
  if (!res.ok) throw new Error(res.error);

  // If rotating own key, log out so they must re-authenticate
  if (sshSession && sshSession.id === adminId) {
    clearSSHSession();
    updateSSHAuthUI();
  }

  return {
    privateKey: keyPair.privateKey,
    fingerprint: keyPair.fingerprint,
    username: res.data.username
  };
}

// ===== UI UPDATE =====
function updateSSHAuthUI() {
  const loginBtn = document.getElementById('loginBtnToolbar');
  const adminBtn = document.getElementById('adminPanelBtn');
  const mobAdminBtn = document.getElementById('mobOverflowAdminBtn');

  if (!loginBtn) return;

  if (isSSHLoggedIn()) {
    const icon = isSSHAdmin() ? '&#x1F511;' : '&#x2713;';
    loginBtn.innerHTML = `${icon} ${sshSession.username}`;
    loginBtn.style.background = 'var(--selected)';
    loginBtn.style.color = 'var(--accent)';
    if (adminBtn && isSSHAdmin()) adminBtn.style.display = '';
    if (mobAdminBtn && isSSHAdmin()) mobAdminBtn.style.display = '';
  } else {
    loginBtn.innerHTML = '&#x1F511; SSH Login';
    loginBtn.style.background = '';
    loginBtn.style.color = '';
    if (adminBtn) adminBtn.style.display = 'none';
    if (mobAdminBtn) mobAdminBtn.style.display = 'none';
  }
}

// ===== SYSTEM LOGS =====
// Logs are now written server-side (via logEvent in sshProxy).
// These helpers fetch them for display in the admin terminal.
async function getSSHLogs(limit = 50) {
  const res = await sshProxy('getLogs', { limit });
  return res.ok ? res.data.logs : [];
}

async function clearSSHLogs() {
  await sshProxy('clearLogs');
}

// Keep a thin local shim so call-sites that do SSHAuth.log() still work
function logSSHEvent(action, details = {}) {
  sshProxy('logEvent', {
    action,
    username: sshSession?.username || 'anonymous',
    ...details
  }).catch(() => {});
}

// Export for global use
if (typeof window !== 'undefined') {
  window.SSHAuth = {
    init: initSSHAuth,
    register: registerSSHUser,
    registerAdmin: registerSSHAdmin,
    login: loginWithSSHKey,
    logout: logoutSSH,
    isLoggedIn: isSSHLoggedIn,
    isAdmin: isSSHAdmin,
    hasPermission: hasSSHPermission,
    getSession: getSSHSession,
    getUsers: getSSHUsers,
    getAdmins: getSSHAdmins,
    revokeUser: revokeSSHUser,
    revokeAdmin: revokeSSHAdmin,
    rotateKey: rotateAdminKey,
    log: logSSHEvent,
    getLogs: getSSHLogs,
    clearLogs: clearSSHLogs
  };
}