import { acik } from './ayar'
import { telefonGonder } from './telefon'
import { adi, calistir } from './ortak'
import type { $T } from './ortak'

const TERMINAL_NOTIFIER = ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier']

// macOS bildirimi: $.ui.notify VS Code terminalinde yalnız zil çalıyor ve classic.Notification'ı yeniden tetikliyor.
// terminal-notifier varsa o (Bildirimler'de kendi adıyla izin alır); yoksa osascript, o da olmazsa Claude Code'un kendi bildirimi.
export async function macBildirim($: $T, baslik: string, metin: string) {
  let r = { ok: false }
  for (const yol of TERMINAL_NOTIFIER) {
    if (!(await $.fs.exists(yol))) continue
    r = await calistir($, [yol, '-title', baslik, '-message', metin.slice(0, 200) || ' ', '-sound', 'default', '-group', 'claude-genel'])
    break
  }
  if (!r.ok) {
    r = await calistir($, [
      'osascript', '-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title (item 2 of argv)', '-e', 'end run',
      metin.slice(0, 200), baslik,
    ])
  }
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
