# Real-time Translator & Interview Assistant

Electron desktop app (Windows 11) that combines:

- **Translator Mode** — real-time speech-to-text + translation to Vietnamese via the [Soniox](https://soniox.com/) streaming API.
- **Interview Assistant Mode** — detects interview questions from your microphone, then uses an OpenAI-compatible GPT model to generate a structured analysis and a suggested answer.
- **Combined Mode** — runs both modes off a **single** microphone stream and a **single** Soniox WebSocket connection.

> Built with Electron + React + TypeScript. API keys are kept in the Electron main process — they are **never** shipped in the renderer bundle.

---

## Features

### Translator Mode
- Microphone capture (16 kHz mono PCM s16le via `AudioWorklet`).
- Live original transcript + Vietnamese translation side-by-side.
- `Start`, `Stop`, `Copy`, `Clear`, `Save History`.

### Interview Assistant Mode
- Soniox streams the question text + Vietnamese translation.
- GPT call returns structured JSON:
  - `question_meaning_vi` — ý nghĩa câu hỏi (VI).
  - `interviewer_intent_vi` — điều người phỏng vấn muốn biết.
  - `suggested_answer` — câu trả lời gợi ý (theo dropdown ngôn ngữ/độ dài/trình độ/phong cách).
  - `answer_translation_vi` — bản dịch VI nếu câu trả lời là EN/DE.
  - `useful_phrases` — 3–5 cụm từ hữu ích kèm nghĩa VI.
- Auto Detect Question (default ON), Auto Generate Answer (default OFF).
- `Generate Answer`, `Improve Answer`, `Simplify Answer`, `Copy Answer`, `Save History`.
- Dropdowns: answer language (Vietnamese/English/German), length (Short/Medium/Detailed), level (Simple/A2/B1/B2/Professional), style (Natural/Professional/Confident/Humble).

### Combined Mode
- Optional toggle in Settings (`Enable Combined Mode`).
- Translator + Interview run side-by-side, sharing the same mic stream and the same Soniox WebSocket.

### Auto Detect Question heuristics
- Triggers when a sentence ends with `?` **or** starts with a wh-word (English/German) **or** contains a Vietnamese question phrase (e.g. `gì`, `tại sao`, `khi nào`, …).
- **Debounce** 2 s after the speaker stops (configurable).
- **Minimum length** check (default 12 chars).
- **Duplicate** detection via Levenshtein similarity (default ≥ 0.85 → skip).
- **GPT cooldown** 8 s (configurable; minimum 1 s enforced in main process to protect the wallet).

### Security
- API keys live only in the main process, persisted via `electron-store` (lightly obfuscated on disk).
- `contextIsolation: true`, `nodeIntegration: false`, locked-down CSP.
- Renderer never sees raw keys — it only knows whether each key is "set" or "unset".

### Storage
- Settings: `electron-store` JSON in `%APPDATA%/realtime-translator-interview-assistant/settings.json`.
- History: `%APPDATA%/realtime-translator-interview-assistant/history.json` (last 1000 entries).

### UI
- Dark mode by default, with a one-click theme toggle in the top-right.

---

## Project structure

```
realtime-translator-interview-assistant/
├── electron/                   # Main process (Node) — owns API keys, no renderer access
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc.ts                  # shared IPC channel names + types
│   ├── soniox/SonioxClient.ts  # WebSocket client to wss://stt-rt.soniox.com
│   ├── openai/OpenAIClient.ts  # JSON-strict GPT chat completions
│   └── store/{settings,history}.ts
├── src/                        # Renderer (React + TypeScript)
│   ├── App.tsx
│   ├── components/             # ModeTabs, Translator/Interview/Combined/Settings/History
│   ├── audio/                  # mic capture + AudioWorklet PCM downsample
│   ├── question/               # detector + similarity + debounce
│   ├── store/                  # Zustand stores
│   └── lib/                    # sonioxBridge (token bus), streamControl (refcount)
├── assets/
├── package.json
├── tsconfig.json / tsconfig.main.json
├── vite.config.ts
├── .env.example
└── README.md
```

---

## Getting started on Windows 11

### 1. Prerequisites
- **Node.js 20.x or newer** (download from [nodejs.org](https://nodejs.org/)).
- **Git** (download from [git-scm.com](https://git-scm.com/)).
- A working microphone. Windows will prompt for microphone permission the first time the app accesses the mic.

### 2. Clone and install
```powershell
git clone https://github.com/<your-fork>/translator_realtime.git
cd translator_realtime\realtime-translator-interview-assistant
npm install
```

### 3. Run in development
```powershell
npm run dev
```
This starts Vite + Electron in dev mode. The Electron window opens automatically.

### 4. Configure API keys (no `.env` required)
Open the app → click **Settings**:
1. Paste your **Soniox API Key** → `Save`. Click **Test Soniox Connection**.
2. Paste your **GPT API Key** → `Save`. Click **Test GPT Connection**.
3. (Optional) Adjust `GPT_MODEL`, temperature, max tokens.
4. (Optional) Toggle **Enable Combined Mode** to expose the Combined tab.

> The `.env.example` is provided for reference only — keys entered through the UI are stored in `%APPDATA%`, **not** in `.env` and never bundled into the frontend.

### 5. Build a production bundle (optional)
```powershell
npm run build       # writes dist-electron/, dist/, then packages an unpacked Win64 dir
npm run build:exe   # produces a Windows installer in release/ via electron-builder
```

> `npm run build` only outputs an unpacked folder so it is safe to run on slower machines. Use `npm run build:exe` to actually generate the `.exe` installer.

---

## `.env.example`

The repository ships an `.env.example` (kept for the file-shape requirement of the task):

```
SONIOX_API_KEY=
SONIOX_API_BASE_URL=

GPT_API_KEY=
GPT_API_BASE_URL=https://api.openai.com/v1
GPT_MODEL=gpt-4.1-mini
```

The runtime app does **not** read `.env`; it reads from the encrypted `electron-store` populated through the Settings UI. This keeps secrets out of the renderer bundle and out of source control.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Soniox API key is required" | Open Settings → paste key → Save. |
| `Test Soniox Connection` fails | Verify the key, check firewall/VPN, confirm `SONIOX_API_BASE_URL` is empty or points to `wss://stt-rt.soniox.com`. |
| GPT returns "Cooldown active. Wait Ns." | Wait for cooldown or lower it in Settings (minimum 1 s enforced). |
| No mic prompt on Windows | Settings → Privacy → Microphone → enable for the app. |
| Audio garbled or no transcript | Make sure your default mic is the one you expect; some Bluetooth headsets only expose 8 kHz. |

---

## License

MIT.
