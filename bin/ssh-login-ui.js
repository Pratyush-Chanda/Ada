// ===== SSH LOGIN UI HANDLERS =====

let generatedKeyData = null;

// ===== TAB SWITCHING =====
function switchSSHTab(tab) {
  const tabs = document.querySelectorAll('#sshAuthTabs .guide-tab');
  tabs.forEach((t, i) => {
    t.classList.toggle('active', i === (tab === 'login' ? 0 : 1));
  });
  
  document.getElementById('sshLoginView').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('sshRegisterView').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('sshKeyGenerated').style.display = 'none';
  document.getElementById('sshLoggedInView').style.display = 'none';
  
  // Clear messages
  document.getElementById('sshLoginMsg').textContent = '';
  document.getElementById('sshRegisterMsg').textContent = '';
}

// ===== SHOW/HIDE LOGIN SCREEN =====
function showSSHLoginScreen() {
  const overlay = document.getElementById('loginOverlay');
  
  if (SSHAuth.isLoggedIn()) {
    // Show logged in view
    document.getElementById('sshAuthTabs').style.display = 'none';
    document.getElementById('sshLoginView').style.display = 'none';
    document.getElementById('sshRegisterView').style.display = 'none';
    document.getElementById('sshKeyGenerated').style.display = 'none';
    document.getElementById('sshLoggedInView').style.display = '';
    
    const session = SSHAuth.getSession();
    document.getElementById('sshUserIcon').innerHTML = SSHAuth.isAdmin() ? '&#x1F511;' : '&#x2705;';
    document.getElementById('sshUserName').textContent = `Hello, ${session.username}!`;
    document.getElementById('sshUserRole').textContent = `Authenticated as ${session.role}`;
    document.getElementById('sshSessionFingerprint').textContent = session.fingerprint || 'N/A';
    document.getElementById('sshSessionRole').textContent = session.role.toUpperCase();
    document.getElementById('sshAdminBtn').style.display = SSHAuth.isAdmin() ? '' : 'none';
  } else {
    // Show login tabs
    document.getElementById('sshAuthTabs').style.display = 'flex';
    switchSSHTab('login');
  }
  
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function hideSSHLoginScreen() {
  const overlay = document.getElementById('loginOverlay');
  overlay.classList.remove('active');
  setTimeout(() => {
    overlay.style.display = 'none';
    // Reset views
    document.getElementById('sshPrivateKeyInput').value = '';
    document.getElementById('sshUsernameInput').value = '';
    document.getElementById('sshLoginMsg').textContent = '';
    document.getElementById('sshRegisterMsg').textContent = '';
  }, 380);
}

// Legacy function mapping
function showLoginScreen() {
  showSSHLoginScreen();
}

function hideLoginScreen() {
  hideSSHLoginScreen();
}

// ===== LOGIN =====
async function attemptSSHLogin() {
  const msgEl = document.getElementById('sshLoginMsg');
  const privateKey = document.getElementById('sshPrivateKeyInput').value.trim();
  
  if (!privateKey) {
    msgEl.textContent = 'Please paste your private key';
    msgEl.className = 'login-msg err';
    return;
  }
  
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    msgEl.textContent = 'Invalid key format. Must be in PEM format.';
    msgEl.className = 'login-msg err';
    return;
  }
  
  msgEl.textContent = 'Authenticating...';
  msgEl.className = 'login-msg';
  
  try {
    const result = await SSHAuth.login(privateKey);
    
    msgEl.textContent = 'Access granted!';
    msgEl.className = 'login-msg ok';
    
    SSHAuth.log('login', { username: result.username, role: result.role });
    
    setTimeout(() => {
      showSSHLoginScreen(); // Refresh to show logged in view
    }, 800);
  } catch (error) {
    msgEl.textContent = error.message;
    msgEl.className = 'login-msg err';
  }
}

// ===== REGISTRATION =====
async function generateSSHKey() {
  const msgEl = document.getElementById('sshRegisterMsg');
  const username = document.getElementById('sshUsernameInput').value.trim();
  
  if (!username || username.length < 3) {
    msgEl.textContent = 'Username must be at least 3 characters';
    msgEl.className = 'login-msg err';
    return;
  }
  
  msgEl.textContent = 'Generating key pair...';
  msgEl.className = 'login-msg';
  
  try {
    const result = await SSHAuth.register(username);
    generatedKeyData = result;
    
    // Show the generated key view
    document.getElementById('sshAuthTabs').style.display = 'none';
    document.getElementById('sshRegisterView').style.display = 'none';
    document.getElementById('sshKeyGenerated').style.display = '';
    
    document.getElementById('sshGeneratedKey').value = result.privateKey;
    document.getElementById('sshKeyFingerprint').textContent = result.fingerprint;
    
    SSHAuth.log('register', { username: result.username, fingerprint: result.fingerprint });
    
  } catch (error) {
    msgEl.textContent = error.message;
    msgEl.className = 'login-msg err';
  }
}

// ===== COPY KEY =====
function copySSHKey() {
  const keyField = document.getElementById('sshGeneratedKey');
  keyField.select();
  document.execCommand('copy');
  
  // Visual feedback
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = 'Copied!';
  btn.style.background = '#10b981';
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 2000);
}

// ===== CONFIRM KEY BACKUP =====
async function confirmKeyBackup() {
  if (!generatedKeyData) return;
  
  // Auto-login with the generated key
  try {
    await SSHAuth.login(generatedKeyData.privateKey);
    generatedKeyData = null;
    showSSHLoginScreen(); // Refresh to show logged in view
  } catch (error) {
    console.error('Auto-login failed:', error);
    hideSSHLoginScreen();
  }
}

// ===== LOGOUT =====
function logoutSSHUser() {
  SSHAuth.logout();
  SSHAuth.log('logout', {});
  hideSSHLoginScreen();
}

// Legacy function mapping
function doLogout() {
  logoutSSHUser();
}

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', () => {
  SSHAuth.init();
});

// Override the login button handler
window.addEventListener('load', () => {
  const loginBtn = document.getElementById('loginBtnToolbar');
  if (loginBtn) {
    loginBtn.onclick = showSSHLoginScreen;
  }
});
