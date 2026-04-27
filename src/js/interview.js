/**
 * Interview Mode — heuristic question detection + suggestion panel.
 *
 * PR #1 (foundation): wires detection → debounce → de-dup → backend stub.
 * Backend currently returns a placeholder; PR #2 will plug in real LLM calls.
 *
 * Public API:
 *   - interviewMode.init(settingsManager)
 *   - interviewMode.toggleEnabled()              // ⌘ I
 *   - interviewMode.retryLast()                  // ⌘ Shift I
 *   - interviewMode.feedText({ original, translation })
 *
 * The detector is regex-based across EN / VI / JP / KR. Spec §7.
 */

const { invoke } = window.__TAURI__.core;

// ─────────────────────────────── Detection ───────────────────────────────

/**
 * Heuristic question patterns. Order matters: more-specific patterns first so
 * that a sentence matched by an explicit interrogative isn't double-counted by
 * the trailing "?" pattern. Each entry returns true on a positive match.
 *
 * Sources:
 *   - EN WH-words & yes/no auxiliaries
 *   - VI question particles ("không", "à", "phải không", "có ... không")
 *   - JP final particles か / ですか / ますか
 *   - KR final endings 까요 / 나요 / ㄴ가요
 */
const QUESTION_PATTERNS = [
  // Trailing question mark (covers most languages, full-width and half-width)
  /[?？]\s*$/,

  // English interrogatives at sentence start
  /\b(what|why|how|when|where|who|which|whose|whom)\b/i,
  // English yes/no auxiliaries at sentence start
  /^\s*(do|does|did|can|could|would|should|will|shall|may|might|must|are|is|am|was|were|have|has|had)\b/i,

  // Vietnamese
  /\b(làm sao|tại sao|như thế nào|thế nào|ra sao|bao giờ|khi nào|ở đâu|ai là|cái gì|cái nào)\b/i,
  /\b(có|đã|đang|sẽ)\b.*\bkhông\??\s*$/i,
  /\b(phải không|đúng không|được không|có phải)\??\s*$/i,

  // Japanese — sentence-final か / ですか / ますか / でしょうか
  /(か|ですか|ますか|でしょうか|かな|かしら)[。」]?\s*$/,

  // Korean — sentence-final ~까요 / ~나요 / ~ㄴ가요 / ~ㅂ니까
  /(까요|나요|ㄴ가요|ㅂ니까|습니까|입니까)[?]?\s*$/,
];

/**
 * Decide whether `text` looks like a question worth answering.
 */
export function isLikelyQuestion(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return QUESTION_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Cheap signature for de-dup. Lower-cases, strips punctuation/whitespace.
 */
function normalizeForDedup(text) {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

// ─────────────────────────────── State machine ───────────────────────────

const STATE = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

class InterviewMode {
  constructor() {
    this.settingsManager = null;
    this.settings = null;

    this.state = STATE.IDLE;
    this.lastQuestion = null;
    this.lastSignature = null;
    this.lastSuggestion = null;
    this.lastError = null;

    this._debounceTimer = null;
    this._pendingQuestion = null;
    this._inFlight = null; // current AbortController-like token (promise id)
    this._requestId = 0;

    this._panel = null;
    this._toggleButton = null;
  }

  init(settingsManager) {
    this.settingsManager = settingsManager;
    this.settings = settingsManager.get();
    settingsManager.onChange((s) => {
      this.settings = s;
      this._refreshToggleVisuals();
    });

    this._panel = document.getElementById('interview-panel');
    this._toggleButton = document.getElementById('btn-interview');

    if (this._panel) {
      const closeBtn = this._panel.querySelector('[data-interview-close]');
      if (closeBtn) closeBtn.addEventListener('click', () => this.hidePanel());
      const retryBtn = this._panel.querySelector('[data-interview-retry]');
      if (retryBtn) retryBtn.addEventListener('click', () => this.retryLast());
    }

    if (this._toggleButton) {
      this._toggleButton.addEventListener('click', () => this.toggleEnabled());
    }

    this._refreshToggleVisuals();
  }

  isEnabled() {
    return !!(this.settings && this.settings.interview_enabled);
  }

  async toggleEnabled() {
    if (!this.settingsManager) return;
    const next = !this.isEnabled();
    await this.settingsManager.save({ interview_enabled: next });
    this.settings = this.settingsManager.get();
    this._refreshToggleVisuals();
    if (next) {
      this.showPanel();
      this._renderState();
    } else {
      this.hidePanel();
      this._cancelPending();
    }
  }

  /**
   * Called by the transcript pipeline whenever new text is finalized.
   * `original` and `translation` are both strings (may be empty).
   */
  feedText({ original = '', translation = '' } = {}) {
    if (!this.isEnabled()) return;

    const trigger = this.settings.interview_trigger_source || 'original';
    const candidate = (trigger === 'translation' ? translation : original) || '';
    const trimmed = candidate.trim();
    if (!trimmed) return;

    const minChars = this.settings.interview_min_question_chars ?? 8;
    if (trimmed.length < minChars) return;

    if (!isLikelyQuestion(trimmed)) return;

    const sig = normalizeForDedup(trimmed);
    if (sig && sig === this.lastSignature) return; // de-dup

    // Drop oldest pending and prioritize newest (spec §13.6).
    this._pendingQuestion = trimmed;
    this._setState(STATE.PENDING, { question: trimmed });

    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    const delay = this.settings.interview_debounce_ms ?? 1500;
    this._debounceTimer = setTimeout(() => this._fire(trimmed, sig), delay);
  }

  async retryLast() {
    if (!this.isEnabled()) return;
    const q = this.lastQuestion || this._pendingQuestion;
    if (!q) return;
    const sig = normalizeForDedup(q);
    this._cancelPending();
    await this._fire(q, sig, /*force*/ true);
  }

  showPanel() {
    if (this._panel) this._panel.classList.add('visible');
  }

  hidePanel() {
    if (this._panel) this._panel.classList.remove('visible');
  }

  // ──────────────────────────── Internals ────────────────────────────────

  _cancelPending() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._pendingQuestion = null;
    this._inFlight = null;
  }

  async _fire(question, signature, force = false) {
    this._debounceTimer = null;
    this._pendingQuestion = null;

    if (!force && signature && signature === this.lastSignature) return;

    this.lastQuestion = question;
    this.lastSignature = signature;

    const reqId = ++this._requestId;
    this._inFlight = reqId;
    this._setState(STATE.LOADING, { question });

    try {
      const suggestion = await invoke('interview_suggest', { question });
      // If a newer request was kicked off while we were awaiting, drop ours.
      if (this._inFlight !== reqId) return;
      this.lastSuggestion = suggestion;
      this.lastError = null;
      this._setState(STATE.READY, { suggestion });
    } catch (err) {
      if (this._inFlight !== reqId) return;
      this.lastError = err && err.toString ? err.toString() : String(err);
      this.lastSuggestion = null;
      this._setState(STATE.ERROR, { error: this.lastError });
    }
  }

  _setState(state, payload = {}) {
    this.state = state;
    this._renderState(payload);
  }

  _renderState(payload = {}) {
    if (!this._panel) return;
    if (this.isEnabled()) this.showPanel();

    const $ = (sel) => this._panel.querySelector(sel);
    const stateEl = $('[data-interview-state]');
    const questionEl = $('[data-interview-question]');
    const messageEl = $('[data-interview-message]');
    const pointsEl = $('[data-interview-points]');
    const sampleEl = $('[data-interview-sample]');
    const followEl = $('[data-interview-follow]');
    const badgeEl = $('[data-interview-badge]');

    const reset = () => {
      if (pointsEl) pointsEl.innerHTML = '';
      if (sampleEl) sampleEl.textContent = '';
      if (followEl) followEl.innerHTML = '';
      if (badgeEl) badgeEl.textContent = '';
    };

    switch (this.state) {
      case STATE.IDLE: {
        reset();
        if (stateEl) stateEl.dataset.state = 'idle';
        if (questionEl) questionEl.textContent = '';
        if (messageEl) {
          messageEl.textContent = this.isEnabled()
            ? 'Listening for questions…'
            : 'Interview Mode is off. Press ⌘ I to enable.';
        }
        return;
      }
      case STATE.PENDING: {
        reset();
        if (stateEl) stateEl.dataset.state = 'pending';
        if (questionEl) questionEl.textContent = payload.question || '';
        if (messageEl) messageEl.textContent = 'Detected a question — waiting for the speaker to finish…';
        return;
      }
      case STATE.LOADING: {
        reset();
        if (stateEl) stateEl.dataset.state = 'loading';
        if (questionEl) questionEl.textContent = payload.question || this.lastQuestion || '';
        if (messageEl) messageEl.textContent = 'Generating suggestion…';
        return;
      }
      case STATE.READY: {
        const s = payload.suggestion || this.lastSuggestion;
        if (stateEl) stateEl.dataset.state = s && s.status === 'ready' ? 'ready' : 'unconfigured';
        if (questionEl) questionEl.textContent = (s && s.question) || this.lastQuestion || '';
        if (messageEl) {
          if (s && s.status_message) {
            messageEl.textContent = s.status_message;
          } else {
            messageEl.textContent = '';
          }
        }
        if (pointsEl) {
          pointsEl.innerHTML = '';
          (s?.talking_points || []).forEach((tp) => {
            const li = document.createElement('li');
            li.textContent = tp;
            pointsEl.appendChild(li);
          });
        }
        if (sampleEl) sampleEl.textContent = s?.sample_answer || '';
        if (followEl) {
          followEl.innerHTML = '';
          (s?.follow_up_questions || []).forEach((fq) => {
            const li = document.createElement('li');
            li.textContent = fq;
            followEl.appendChild(li);
          });
        }
        if (badgeEl) {
          if (s && s.latency_ms) {
            badgeEl.textContent = `via ${s.provider_used} • ${(s.latency_ms / 1000).toFixed(1)}s`;
          } else {
            badgeEl.textContent = '';
          }
        }
        return;
      }
      case STATE.ERROR: {
        reset();
        if (stateEl) stateEl.dataset.state = 'error';
        if (questionEl) questionEl.textContent = this.lastQuestion || '';
        if (messageEl) messageEl.textContent = `Error: ${payload.error || 'unknown'}`;
        return;
      }
      default:
        return;
    }
  }

  _refreshToggleVisuals() {
    if (!this._toggleButton) return;
    this._toggleButton.classList.toggle('active', this.isEnabled());
    this._toggleButton.title = this.isEnabled()
      ? 'Interview Mode is ON (⌘ I)'
      : 'Interview Mode is OFF (⌘ I)';
  }
}

export const interviewMode = new InterviewMode();
