import { acik } from './ayar'
import { telefonGonder } from './telefon'
import { adi, calistir } from './ortak'
import type { $T } from './ortak'

// macOS bildirimi: $.ui.notify VS Code terminalinde yalnız zil çalıyor ve classic.Notification'ı yeniden tetikliyor.
export async function macBildirim($: $T, baslik: string, metin: string) {
  const r = await calistir($, [
    'osascript', '-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title (item 2 of argv)', '-e', 'end run',
    metin.slice(0, 200), baslik,
  ])
  if (!r.ok) await $.ui.notify(metin.slice(0, 140), { title: baslik }).catch(() => {})
  await telefonGonder($, baslik, adi(await $.session.cwd()))
  if (await acik($, 'ses')) await $.audio.speak(baslik.startsWith('Claude bitti') ? 'Bitti' : 'Seni bekliyor').catch(() => {})
}

let sonBildirim = 0

// Claude izin isterken ya da cevap beklerken (classic Notification olayı).
export async function bekliyorHaberi($: $T, e: { message?: string }) {
  if (!(await acik($, 'bekliyor'))) return
  const simdi = await $.clock.now()
  if (simdi - sonBildirim < 30_000) return
  sonBildirim = simdi
  await macBildirim($, 'Claude seni bekliyor', e.message || 'Cevabın ya da onayın gerekiyor')
}
