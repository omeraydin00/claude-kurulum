import type { TurnCompleteInput } from 'claude-code'

import { acik } from './ayar'
import { macBildirim } from './bildirim'
import type { $T } from './ortak'

const UZUN_MS = 60_000

// Uzun süren tur bitince bildirim: ekran başında beklemek gerekmesin.
export async function bittiHaberi($: $T, e: TurnCompleteInput, cevap: string) {
  if (e.agentId || e.isAborted || e.durationMs < UZUN_MS || !(await acik($, 'bitti'))) return
  const ilk = cevap.split('\n').map(s => s.replace(/[*#`>|]/g, '').trim()).find(Boolean) ?? 'Hazır'
  const dk = Math.round(e.durationMs / 60_000)
  await macBildirim($, `Claude bitti (${dk} dk)`, ilk)
}
