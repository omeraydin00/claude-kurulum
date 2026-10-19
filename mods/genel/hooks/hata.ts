import { acik } from './ayar'
import { adi, calistir } from './ortak'
import type { $T } from './ortak'

const HATA = /(error|ERR!|exception|failed|failure|cannot|can't|could not|not found|denied|refused|EADDRINUSE|ENOENT|EACCES|ECONNREFUSED|fatal|traceback|hata)/i

// Hata satırının değişmeyen en uzun parçası: yol, sayı, tırnak içi ve hex atılır; eski kayıtlarda aynen geçer.
export function hataImzasi(cikti: string): string | null {
  const satirlar = cikti.split('\n').map(s => s.trim()).filter(s => HATA.test(s))
  let en: string | null = null
  for (const satir of satirlar.slice(0, 20)) {
    for (const parca of satir.split(/(?:\/[^\s:]+|~\/\S+|0x[0-9a-f]+|\d+|'[^']*'|"[^"]*"|`[^`]*`|\\)/i)) {
      const p = parca.trim().replace(/^[\s:,.()[\]-]+|[\s:,.()[\]-]+$/g, '')
      if (p.length >= 18 && p.length <= 160 && HATA.test(p) && (!en || p.length > en.length)) en = p
    }
  }
  return en
}

type Kayit = { type?: string; timestamp?: string; message?: { content?: unknown } }

function metinBlogu(k: Kayit): string | null {
  if (k.type !== 'assistant' || !Array.isArray(k.message?.content)) return null
  const t = (k.message!.content as { type?: string; text?: string }[]).find(b => b.type === 'text' && (b.text ?? '').trim().length > 30)
  return t?.text?.trim() ?? null
}

// Kayıt dosyasında hatanın geçtiği satırdan sonra Claude'un ilk açıklaması.
export function sonrakiAciklama(satirlar: string[]): { zaman: string | null; metin: string | null } {
  let zaman: string | null = null
  for (const s of satirlar) {
    let k: Kayit
    try {
      k = JSON.parse(s) as Kayit
    } catch {
      continue
    }
    zaman ??= k.timestamp ?? null
    const t = metinBlogu(k)
    if (t) return { zaman, metin: t.replace(/\s+/g, ' ').slice(0, 600) }
  }
  return { zaman, metin: null }
}

const sorulan = new Set<string>()

export async function hataHafizasi($: $T, cikti: string): Promise<string | null> {
  if (!(await acik($, 'hata'))) return null
  const imza = hataImzasi(cikti)
  if (!imza || sorulan.has(imza)) return null
  sorulan.add(imza)
  const ev = await $.env.get('HOME')
  if (!ev) return null
  const buOturum = await $.session.id()
  const bulunan = (await calistir($, ['find', `${ev}/.claude/projects`, '-maxdepth', '2', '-name', '*.jsonl', '-exec', 'grep', '-lF', '--', imza, '{}', '+'], undefined, 8_000)).out
    .split('\n')
    .filter(d => d && !d.endsWith(`/${buOturum}.jsonl`))
  if (bulunan.length === 0) return null

  const ornekler: string[] = []
  for (const dosya of bulunan.slice(0, 3)) {
    const satir = Number((await calistir($, ['grep', '-n', '-m1', '-F', '--', imza, dosya])).out.split(':')[0])
    if (!satir) continue
    const sonra = (await calistir($, ['sed', '-n', `${satir},${satir + 60}p`, dosya])).out.split('\n')
    const { zaman, metin } = sonrakiAciklama(sonra)
    const proje = adi(dosya.slice(0, dosya.lastIndexOf('/'))).replace(/^-Users-[^-]+-(Documents-)?(GitHub-)?/, '')
    ornekler.push(`- ${proje}${zaman ? `, ${zaman.slice(0, 10)}` : ''}${metin ? `: "${metin}"` : ''} (kayıt: ${dosya}:${satir})`)
  }
  if (ornekler.length === 0) return null
  $.ui.toast(`🧠 Bu hata daha önce ${bulunan.length} oturumda görüldü`, { timeoutMs: 6_000 })
  return `[genel/hata] "${imza}" hatası eski oturumlarda da görülmüş. O zamanki ilk açıklama (çözüm sonraki satırlarda olabilir; gerekirse kayıttan oku):\n${ornekler.join('\n')}`
}
