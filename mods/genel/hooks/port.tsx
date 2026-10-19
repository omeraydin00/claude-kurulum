import { atom, read, update } from 'claude-code'
import type { RenderInput } from 'claude-code'

import { acik } from './ayar'
import { notEkle } from './durum'
import { adi, calistir } from './ortak'
import type { $T } from './ortak'

const cakisma = atom({ plugin: 'genel', key: 'port' } as const, null)

// "EADDRINUSE ... :8081", "Port 3000 is already in use", "Something is already running on port 8081".
export function portBul(cikti: string): number | null {
  const m =
    cikti.match(/EADDRINUSE[^\n]*?:(\d{2,5})\b/) ??
    cikti.match(/address already in use[^\n]*?:(\d{2,5})\b/i) ??
    cikti.match(/port[^\d\n]{0,20}(\d{2,5})[^\n]{0,30}(?:already in use|in use|kullanımda)/i) ??
    cikti.match(/already running on port (\d{2,5})/i)
  return m ? Number(m[1]) : null
}

export async function portCakismasi($: $T, cikti: string): Promise<string | null> {
  if (!(await acik($, 'port'))) return null
  const port = portBul(cikti)
  if (!port) return null
  const satir = (await calistir($, ['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'])).out
  const pid = Number(satir.match(/^p(\d+)/m)?.[1])
  if (!pid) return null
  const program = satir.match(/^c(.+)$/m)?.[1] ?? '?'
  const klasor = (await calistir($, ['lsof', '-a', '-p', String(pid), '-d', 'cwd', '-Fn'])).out.match(/^n(.+)$/m)?.[1] ?? ''
  await update($, cakisma, () => ({ port, pid, program, klasor }))
  return `[genel/port] Port ${port}'i ${program} (pid ${pid}${klasor ? `, klasör ${klasor}` : ''}) tutuyor. Kullanıcıya prompt üstünde "Kapat" düğmesi gösterildi; kendin öldürme, başka port önerebilirsin.`
}

export async function portBant($: $T, e: RenderInput<'AbovePrompt'>) {
  const c = await read($, cakisma)
  if (!c) return null
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box>
      <Text color="warning" wrap="truncate-end">⚠ Port {c.port}: {c.program} (pid {c.pid}{c.klasor ? `, ${adi(c.klasor)}` : ''}) tutuyor </Text>
      <Button
        key="port-kapat"
        plain
        label="[kapat]"
        onPress={async () => {
          const r = await calistir($, ['kill', String(c.pid)])
          await update($, cakisma, () => null)
          $.ui.toast(r.ok ? `Port ${c.port} boşaldı` : `Kapatılamadı: ${r.err}`)
          if (r.ok) notEkle(`[genel/port] Kullanıcı port ${c.port}'i tutan ${c.program} (pid ${c.pid}) sürecini kapattı; komutu yeniden çalıştırabilirsin.`)
        }}
      />
      <Text> </Text>
      <Button key="port-birak" plain label="[bırak]" onPress={() => update($, cakisma, () => null)} />
    </Box>
  )
}
