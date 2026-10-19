import { atom, read, update } from 'claude-code'
import type { RenderInput, ToolCallInput } from 'claude-code'

import { acik } from './ayar'
import { adi } from './ortak'
import type { $T } from './ortak'

// Tur sonu kartı: tur boyunca sayılan dosya, satır ve komutlar; süre satırının yerine çizilir.
type Sayac = { dosyalar: string[]; arti: number; eksi: number; komut: number; hata: number }

const bos = (): Sayac => ({ dosyalar: [], arti: 0, eksi: 0, komut: 0, hata: 0 })
let buTur = bos()
// Eski turların satırları da yeniden çizilir: süreye göre saklanır.
const turlar = atom({ plugin: 'genel', key: 'kartlar' } as const, {})

const satirSay = (metin: unknown) => (typeof metin === 'string' && metin.length ? metin.split('\n').length : 0)

export function kartBaslat() {
  buTur = bos()
}

export function kartSay(e: ToolCallInput, hataMi: boolean) {
  const g = e as Record<string, unknown>
  const arac: string = e.tool
  if (typeof g.file_path === 'string' && ['Edit', 'MultiEdit', 'Write'].includes(arac)) {
    if (!buTur.dosyalar.includes(g.file_path)) buTur.dosyalar.push(g.file_path)
    if (arac === 'Write') buTur.arti += satirSay(g.content)
    else {
      const parcalar = arac === 'MultiEdit' && Array.isArray(g.edits) ? (g.edits as Record<string, unknown>[]) : [g]
      for (const p of parcalar) {
        buTur.arti += satirSay(p.new_string)
        buTur.eksi += satirSay(p.old_string)
      }
    }
  }
  if (arac === 'Bash') buTur.komut++
  if (hataMi) buTur.hata++
}

export async function kartKaydet($: $T, sureMs: number) {
  const s = buTur
  await update($, turlar, m => ({ ...Object.fromEntries(Object.entries(m).slice(-200)), [String(sureMs)]: s }))
}

export function sureYaz(ms: number): string {
  const sn = Math.round(ms / 1000)
  if (sn < 60) return `${sn} sn`
  const dk = Math.floor(sn / 60)
  return dk < 60 ? `${dk} dk ${sn % 60} sn` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`
}

export function kartMetni(ms: number, s: Sayac | undefined): string {
  const parca = [`✓ ${sureYaz(ms)}`]
  if (s?.dosyalar.length) parca.push(`${s.dosyalar.length} dosya (+${s.arti} −${s.eksi})`)
  if (s?.komut) parca.push(`${s.komut} komut`)
  if (s?.hata) parca.push(`${s.hata} hata`)
  return parca.join(' · ')
}

export async function kartCiz($: $T, e: RenderInput<'TurnDuration'>) {
  if (!(await acik($, 'kart'))) return null
  const s = (await read($, turlar))[String(e.props.durationMs)]
  const { Text } = $.ui.resolve(e)
  return (
    <Text dimColor>
      {kartMetni(e.props.durationMs, s)}
      {s?.dosyalar.length ? <Text dimColor>{`  ${s.dosyalar.slice(0, 4).map(adi).join(', ')}${s.dosyalar.length > 4 ? '…' : ''}`}</Text> : null}
    </Text>
  )
}
