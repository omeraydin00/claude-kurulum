import { atom, read, update } from 'claude-code'
import type { RenderInput } from 'claude-code'

import type { Kaldik } from '../types'
import { acik } from './ayar'
import { calistir, kapsamRepolar, projeKlasoru } from './ortak'
import type { $T } from './ortak'

const kaldik = atom({ plugin: 'genel', key: 'kaldik' } as const, null)

const OZET_MODELI = 'claude-haiku-5-5'
let baglamVerildi = false

type Satir = { type?: string; timestamp?: string; message?: { content?: unknown } }

// Kayıt kuyruğundan: kullanıcının son istekleri ve Claude'un son cevabı.
export function kayittanCikar(satirlar: string[]): { zaman: number | null; isteklerim: string[]; sonCevap: string | null } {
  const isteklerim: string[] = []
  let sonCevap: string | null = null
  let zaman: number | null = null
  for (const s of satirlar) {
    let k: Satir
    try {
      k = JSON.parse(s) as Satir
    } catch {
      continue
    }
    if (k.timestamp) zaman = Date.parse(k.timestamp)
    const c = k.message?.content
    if (k.type === 'user' && typeof c === 'string' && !c.startsWith('<') && !c.startsWith('Another Claude') && c.trim()) {
      isteklerim.push(c.replace(/\s+/g, ' ').trim().slice(0, 200))
    }
    if (k.type === 'assistant' && Array.isArray(c)) {
      const t = (c as { type?: string; text?: string }[]).filter(b => b.type === 'text' && b.text?.trim()).pop()
      if (t?.text) sonCevap = t.text.trim()
    }
  }
  return { zaman, isteklerim: isteklerim.slice(-4), sonCevap }
}

async function oncekiKayit($: $T): Promise<string | null> {
  const ev = await $.env.get('HOME')
  if (!ev) return null
  const klasor = projeKlasoru(ev, await $.session.cwd())
  const bu = `${await $.session.id()}.jsonl`
  const dosyalar = (await $.fs.list(klasor).catch(() => []))
    .filter(f => f.kind === 'file' && f.name.endsWith('.jsonl') && f.name !== bu)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return dosyalar[0] ? `${klasor}/${dosyalar[0].name}` : null
}

export async function kaldikBaslat($: $T) {
  if (!(await acik($, 'kaldik')) || (await $.session.turns()) > 0) return
  const dosya = await oncekiKayit($)
  if (!dosya) return
  const kuyruk = (await calistir($, ['tail', '-n', '800', dosya])).out.split('\n')
  const { zaman, isteklerim, sonCevap } = kayittanCikar(kuyruk)
  if (!zaman || isteklerim.length === 0) return

  const repolar: string[] = []
  for (const r of await kapsamRepolar($)) {
    const branch = (await calistir($, ['git', 'branch', '--show-current'], r.dir)).out
    const degisik = (await calistir($, ['git', 'status', '--porcelain'], r.dir)).out.split('\n').filter(Boolean).length
    if (branch && (!['main', 'master'].includes(branch) || degisik)) repolar.push(`${r.ad} ${branch}${degisik ? ` (✎${degisik} dosya commit'siz)` : ''}`)
  }

  const yanit = await $.model.complete({
    model: OZET_MODELI,
    maxTokens: 200,
    system: 'Kısa ve sade Türkçe yaz. Teknik ayrıntı değil, iş durumu.',
    prompt: `Bir geliştiricinin önceki kodlama oturumunun sonu. İki cümleyle yaz: ne üzerinde çalışılıyordu ve ne yarım kaldı / sıradaki adım ne.\n\nKullanıcının son istekleri:\n${isteklerim.map(i => `- ${i}`).join('\n')}\n\nAsistanın son cevabı:\n${(sonCevap ?? '').slice(0, 2500)}`,
  })
  const ozet = yanit.isAnswered ? yanit.text.trim() : (sonCevap ?? '').replace(/\s+/g, ' ').slice(0, 200)
  await update($, kaldik, () => ({ zaman, ozet, isteklerim, repolar }))
}

// İlk mesajla Claude'a bir kez: önceki oturumun özeti ("nerede kaldık" sorusu bununla cevaplanır).
export async function kaldikBaglami($: $T): Promise<string | null> {
  const k = await read($, kaldik)
  if (!k || baglamVerildi) return null
  baglamVerildi = true
  return `[genel/kaldik] Bu klasördeki önceki oturum (${new Date(k.zaman).toLocaleString('tr-TR')}): ${k.ozet}\nKullanıcının o oturumdaki son istekleri: ${k.isteklerim.map(i => `"${i}"`).join(', ')}${k.repolar.length ? `\nŞu an commit'siz ya da branch'te olan repolar: ${k.repolar.join(', ')}` : ''}`
}

function ne(zaman: number, simdi: number): string {
  const d = new Date(zaman)
  const saat = d.toTimeString().slice(0, 5)
  const gun = Math.round((new Date(simdi).setHours(0, 0, 0, 0) - new Date(zaman).setHours(0, 0, 0, 0)) / 86_400_000)
  return gun === 0 ? `bugün ${saat}` : gun === 1 ? `dün ${saat}` : `${d.toLocaleDateString('tr-TR')} ${saat}`
}

export async function kaldikBant($: $T, e: RenderInput<'AbovePrompt'>) {
  const k = await read($, kaldik)
  if (!k || e.props.hasSurvey) return null
  const { Box, Button, Text } = $.ui.resolve(e)
  const simdi = await $.clock.now()
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text weight="bold">↩ Son oturum ({ne(k.zaman, simdi)}): </Text>
        <Text>{k.ozet}</Text>
      </Text>
      <Box>
        {k.repolar.length > 0 && <Text dimColor wrap="truncate-end">{k.repolar.join(' · ')} </Text>}
        <Button
          key="kaldik-devam"
          plain
          label="[devam et]"
          onPress={async () => {
            await update($, kaldik, () => null)
            await $.prompt.submit({ text: 'Önceki oturumda kaldığımız yerden devam edelim.', asUser: true })
          }}
        />
        <Text> </Text>
        <Button key="kaldik-kapat" plain label="[kapat]" onPress={() => update($, kaldik, () => null)} />
      </Box>
    </Box>
  )
}

export async function kaldikKapat($: $T) {
  if (await read($, kaldik)) await update($, kaldik, () => null)
}
