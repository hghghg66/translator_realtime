import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { HistoryItem } from '../ipc.js';

const FILENAME = 'history.json';
const MAX_ITEMS = 1000;

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

export function loadHistory(): HistoryItem[] {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const items = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.error('[history] load failed:', err);
    return [];
  }
}

export function appendHistory(item: HistoryItem): HistoryItem[] {
  const items = loadHistory();
  items.unshift(item);
  const trimmed = items.slice(0, MAX_ITEMS);
  try {
    fs.writeFileSync(filePath(), JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (err) {
    console.error('[history] append failed:', err);
  }
  return trimmed;
}

export function clearHistory(): void {
  try {
    fs.writeFileSync(filePath(), '[]', 'utf8');
  } catch (err) {
    console.error('[history] clear failed:', err);
  }
}
