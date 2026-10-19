import { acik } from './ayar'
import { notEkle } from './durum'
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
let rg: string | null | undefined

// Oturum kayıtları GB'larca tutabilir: ripgrep yarım saniyede tarar, macOS grep'i saniyelerce.
async function ripgrep($: $T): Promise<string | null> {
  if (rg === undefined) {
    rg = null
    for (const yol of ['/opt/homebrew/bin/rg', '/usr/local/bin/rg', '/usr/bin/rg']) {
      if (await $.fs.exists(yol)) {
        rg = yol
        break
      }
    }
  }
  return rg
}

export async function hataHafizasi($: $T, cikti: string): Promise<string | null> {
  if (!(await acik($, 'hata'))) return null
  const imza = hataImzasi(cikti)
  if (!imza || sorulan.has(imza)) return null
  sorulan.add(imza)
  if (await ripgrep($)) return hafizadaAra($, imza)
  // ripgrep yoksa arama komutun sonucunu bekletmez; bulunursa bir sonraki fırsatta iletilir.
  hafizadaAra($, imza)
    .then(not => not && notEkle(not))
    .catch(() => {})
  return null
}

async function hafizadaAra($: $T, imza: string): Promise<string | null> {
  const ev = await $.env.get('HOME')
  if (!ev) return null
  const buOturum = await $.session.id()
  const kok = `${ev}/.claude/projects`
  const rgYolu = await ripgrep($)
  const arama = rgYolu
    ? await calistir($, [rgYolu, '-l', '-F', '--max-depth', '2', '-g', '*.jsonl', '--', imza, kok], undefined, 10_000)
    : await calistir($, ['find', kok, '-maxdepth', '2', '-name', '*.jsonl', '-exec', 'grep', '-lF', '--', imza, '{}', '+'], undefined, 120_000)
  const bulunan = arama.out
    .split('\n')
    .filter(d => d && !d.endsWith(`/${buOturum}.jsonl`))
  if (bulunan.length === 0) return null

  const ornekler: string[] = []
  for (const dosya of bulunan.slice(0, 3)) {
    const satir = Number((await calistir($, rgYolu ? [rgYolu, '-n', '-m1', '-o', '-F', '--', imza, dosya] : ['grep', '-n', '-m1', '-o', '-F', '--', imza, dosya])).out.split(':')[0])
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
