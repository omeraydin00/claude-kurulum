import { acik } from './ayar'
import { dosyaOku, kapsamRepolar, repoBilgisi } from './ortak'
import type { $T } from './ortak'

const ORNEKLER = ['.env.example', '.env.sample', '.env.template', '.env.dist']
const bakilan = new Set<string>()

export function anahtarlar(metin: string | null): Set<string> {
  const s = new Set<string>()
  for (const satir of (metin ?? '').split('\n')) {
    const m = satir.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (m) s.add(m[1]!)
  }
  return s
}

// .env.example'da olup .env / .env.local'da olmayan değişkenler.
export async function envEksik($: $T, dir: string): Promise<string | null> {
  for (const ornek of ORNEKLER) {
    const metin = await dosyaOku($, `${dir}/${ornek}`)
    if (metin === null) continue
    const env = await dosyaOku($, `${dir}/.env`)
    const yerel = await dosyaOku($, `${dir}/.env.local`)
    if (env === null && yerel === null) return `.env yok (${ornek} var)`
    const var_ = new Set([...anahtarlar(env), ...anahtarlar(yerel)])
    const eksik = [...anahtarlar(metin)].filter(k => !var_.has(k))
    return eksik.length ? `.env'de eksik: ${eksik.join(', ')}` : null
  }
  return null
}

async function bak($: $T, dir: string, ad: string): Promise<string | null> {
  if (bakilan.has(dir)) return null
  bakilan.add(dir)
  const sonuc = await envEksik($, dir)
  if (!sonuc) return null
  $.ui.toast(`⚙ ${ad}: ${sonuc}`, { timeoutMs: 8_000 })
  return `[genel/env] ${ad}: ${sonuc}. Bağlantı / yapılandırma hatası görürsen önce buna bak; değerleri kullanıcıya sor.`
}

export async function envBaslat($: $T): Promise<string[]> {
  if (!(await acik($, 'env'))) return []
  const notlar: string[] = []
  for (const r of (await kapsamRepolar($)).slice(0, 15)) {
    const n = await bak($, r.dir, r.ad)
    if (n) notlar.push(n)
  }
  return notlar
}

// Oturumda ilk kez dokunulan repo için.
export async function envDokunus($: $T, yol: string): Promise<string | null> {
  if (!(await acik($, 'env'))) return null
  const r = await repoBilgisi($, yol.slice(0, yol.lastIndexOf('/')) || '/')
  return r ? bak($, r.dir, r.ad) : null
}
