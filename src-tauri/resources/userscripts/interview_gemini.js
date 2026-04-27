// Interview Mode userscript for gemini.google.com. See interview_chatgpt.js
// for the shared bridge protocol.
(function () {
  'use strict';
  if (window.location.host.indexOf('gemini.google.com') === -1) return;

  const BRIDGE = window.__INTERVIEW_BRIDGE__ || {};
  const MODE = BRIDGE.mode || 'suggest';

  const SELECTORS = {
    composer: 'rich-textarea div[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea',
    sendButton: 'button[aria-label*="Send" i], button.send-button, button[data-testid*="send" i]',
    assistantTurn: 'message-content, .response-container .markdown, .model-response-text',
    signinLink: 'a[href*="accounts.google.com"]',
    avatar: 'a[aria-label*="Google Account" i], img[alt*="account" i]',
  };

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
    if (document.querySelector(SELECTORS.avatar)) return true;
    if (document.querySelector(SELECTORS.signinLink)) return false;
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
      composer.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = fullPrompt;
      composer.appendChild(p);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const sendBtn = await waitFor(SELECTORS.sendButton, 8000);
    sendBtn.click();
  }

  async function waitForAssistantResponse() {
    const STABLE_MS = 1500;
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
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('Timed out waiting for assistant response');
  }

  async function run() {
    try {
      const loggedIn = await isLoggedIn();
      post('login-status', { signed_in: loggedIn ? 'true' : 'false', provider: 'gemini' });
      if (MODE === 'check_login') return;
      if (!loggedIn) {
        post('error', { message: 'Not signed in. Click Sign in… in Settings.' });
        return;
      }
      await sendQuestion();
      const text = await waitForAssistantResponse();
      post('result', { data: text, provider: 'gemini' });
    } catch (err) {
      post('error', { message: String(err && err.message ? err.message : err) });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 800));
  } else {
    setTimeout(run, 800);
  }
})();
