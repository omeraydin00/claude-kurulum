import type { SessionCompactInput, SessionCompactResult } from 'claude-code'

import { acik } from './ayar'
import { ciOzeti } from './ci'
import { notEkle } from './durum'
import { calistir, kapsamRepolar } from './ortak'
import type { $T } from './ortak'
import { tabletAl } from './tablet'
import { takipAl, takipSatiri } from './takip'

// Sabit metin: precompute'un hazırladığı özet asıl sıkıştırmada da geçerli kalsın.
const TALIMAT = `[genel/devir] Özette ayrı bir "Devir" bölümü olsun ve şunları eksiksiz, numaralarıyla koru:
- Açık ya da açılması bekleyen PR'lar: repo, numara, branch, durum (taslak/review/CI), birbirine bağlantıları.
- Kullanıcının ve yöneticinin istekleri, review yorumları ve henüz yapılmamış olanlar.
- Kullanıcının verdiği kararlar ve onayladığı sürüm numaraları.
- Cihazda / tarayıcıda henüz denenmemiş değişiklikler ve deploy sonrası yapılacaklar.
- Kullanıcının sorduğu ama cevabı bekleyen sorular.`

export function talimatEkle(mevcut: string | undefined): string {
  return [mevcut, TALIMAT].filter(Boolean).join('\n\n')
}

// Sıkıştırmadan hemen sonra Claude'a verilen canlı durum: modun kendi ölçtükleri.
export async function devirDurumu($: $T): Promise<string> {
  const satirlar: string[] = []
  for (const r of await kapsamRepolar($)) {
    const branch = (await calistir($, ['git', 'branch', '--show-current'], r.dir)).out
    const degisik = (await calistir($, ['git', 'status', '--porcelain'], r.dir)).out.split('\n').filter(Boolean).length
    if (branch && (branch !== 'main' && branch !== 'master' || degisik)) satirlar.push(`${r.ad}: ${branch}${degisik ? ` ✎${degisik} dosya` : ''}`)
  }
  const ciDurum = await ciOzeti($)
  if (ciDurum) satirlar.push(ciDurum)
  const t = await tabletAl($)
  if (t) satirlar.push(`tablet: ${t.model} ${t.serial} ${t.bagli ? 'bağlı' : 'kopuk'}, Metro ${t.metro}`)
  const tk = await takipAl($)
  if (tk.length) satirlar.push(`takip (/takip): ${tk.map(takipSatiri).join('; ')}`)
  return satirlar.length ? satirlar.join('\n') : 'açık iş görünmüyor'
}

export async function devirSikistir(
  $: $T,
  e: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
): Promise<SessionCompactResult> {
  if (e.agentId || !(await acik($, 'devir'))) return next(e)
  // Konuşması verilmeyen çağrıda (ör. test) talimat eklenemez; sıkıştırma olduğu gibi sürer.
  const r = await next(Array.isArray(e.messages) ? { ...e, instructions: talimatEkle(e.instructions) } : e)
  if (r.skip === undefined && e.trigger !== 'precompute') {
    const durum = await devirDurumu($)
    notEkle(`[genel/devir] Konuşma az önce sıkıştırıldı. Repoların şu anki durumu (mod git/gh'den ölçtü, özetten daha güncel):\n${durum}`)
  }
  return r
}
