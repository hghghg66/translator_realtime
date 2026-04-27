// Interview Mode userscript for chatgpt.com.
//
// Injected as `initialization_script` so it runs before page scripts. It:
//   1. Waits for the composer + login indicators to appear.
//   2. Reports login status via interview-bridge://login-status.
//   3. Reads the question + system prompt from window.__INTERVIEW_BRIDGE__.
//   4. Pastes a combined prompt, hits send, observes the assistant turn.
//   5. Once streaming stops, posts the parsed JSON to interview-bridge://result.
//
// Selectors are best-effort and may break when the provider redesigns the DOM.

(function () {
  'use strict';

  if (window.location.host.indexOf('chatgpt.com') === -1 &&
      window.location.host.indexOf('chat.openai.com') === -1) {
    return;
  }

  const BRIDGE = window.__INTERVIEW_BRIDGE__ || {};
  const MODE = BRIDGE.mode || 'suggest';

  const SELECTORS = {
    composer: '#prompt-textarea, textarea[data-id="root"], textarea',
    sendButton: 'button[data-testid="send-button"], button[aria-label*="Send" i]',
    assistantTurn: '[data-message-author-role="assistant"]',
    loginButton: 'a[href*="auth/login"], button[data-testid="login-button"]',
    userMenu: 'button[data-testid="profile-button"], [data-testid="user-menu-button"]',
  };

  const log = (...args) => console.log('[interview-bridge:chatgpt]', ...args);
  const post = (path, payload) => {
    const qs = new URLSearchParams(payload || {}).toString();
    window.location.href = `interview-bridge://${path}?${qs}`;
  };

  function waitFor(selector, timeoutMs) {
    return new Promise((resolve, reject) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitFor timeout: ${selector}`));
      }, timeoutMs || 30000);
    });
  }

  async function isLoggedIn() {
    // Login button visible → not logged in. User menu visible → logged in.
    const login = document.querySelector(SELECTORS.loginButton);
    const user = document.querySelector(SELECTORS.userMenu);
    if (user) return true;
    if (login) return false;
    // Fall back to checking for the composer (only present when authed).
    try {
      await waitFor(SELECTORS.composer, 5000);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function sendQuestion() {
    const composer = await waitFor(SELECTORS.composer);
    const fullPrompt = `${BRIDGE.systemPrompt || ''}\n\n${BRIDGE.userPrompt || ''}`.trim();

    composer.focus();
    if (composer.tagName === 'TEXTAREA') {
      composer.value = fullPrompt;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // ContentEditable variant.
      composer.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = fullPrompt;
      composer.appendChild(p);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const sendBtn = await waitFor(SELECTORS.sendButton, 5000);
    sendBtn.click();
  }

  async function waitForAssistantResponse() {
    // Wait until at least one assistant turn appears, then poll its text
    // until it stops changing for STABLE_MS.
    const STABLE_MS = 1200;
    const TIMEOUT_MS = 60000;
    const start = Date.now();

    let lastText = '';
    let lastChange = Date.now();
    while (Date.now() - start < TIMEOUT_MS) {
      const turns = document.querySelectorAll(SELECTORS.assistantTurn);
      const last = turns[turns.length - 1];
      if (last) {
        const text = (last.innerText || last.textContent || '').trim();
        if (text !== lastText) {
          lastText = text;
          lastChange = Date.now();
        } else if (text && Date.now() - lastChange > STABLE_MS) {
          return text;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Timed out waiting for assistant response');
  }

  async function run() {
    try {
      const loggedIn = await isLoggedIn();
      post('login-status', { signed_in: loggedIn ? 'true' : 'false', provider: 'chatgpt' });

      if (MODE === 'check_login') return;
      if (!loggedIn) {
        post('error', { message: 'Not signed in. Click Sign in… in Settings.' });
        return;
      }

      await sendQuestion();
      const text = await waitForAssistantResponse();
      post('result', { data: text, provider: 'chatgpt' });
    } catch (err) {
      log('error', err);
      post('error', { message: String(err && err.message ? err.message : err) });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 600));
  } else {
    setTimeout(run, 600);
  }
})();
