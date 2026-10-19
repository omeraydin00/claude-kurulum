import { atom, read, update } from 'claude-code'
import type { RenderInput } from 'claude-code'

import type { CiIzleme } from '../types'
import { acik } from './ayar'
import { durumYaz, notEkle } from './durum'
import { calistir, gitKlasoru, kapsamRepolar, repoBilgisi } from './ortak'
import type { $T } from './ortak'

export const ci = atom({ plugin: 'genel', key: 'ci' } as const, [])
const mainKirmizi = atom({ plugin: 'genel', key: 'mainKirmizi' } as const, [])

const KONTROL_YOK_SN = 5 * 60
const EN_UZUN_SN = 60 * 60

type Kontrol = { name: string; bucket: string }

async function izle($: $T, slug: string, no: number, url: string) {
  const basladi = await $.clock.now()
  const repo = slug.split('/')[1] ?? slug
  await update($, ci, liste => [...liste.filter(i => !(i.slug === slug && i.no === no)), { slug, repo, no, url, basladi, ozet: null }])
  durumYaz($, 'ci', `CI ${repo} #${no} ⏳`)
}

// gh pr create'in çıktısındaki PR adresi ya da push edilen branch'in açık PR'ı izlemeye alınır.
export async function ciSonrasi($: $T, komut: string, stdout: string) {
  if (!(await acik($, 'ci'))) return
  const adres = stdout.match(/https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/)
  if (/\bgh\s+pr\s+create\b/.test(komut) && adres) return izle($, adres[1]!, Number(adres[2]), adres[0])

  const push = komut.match(/\bgit\b(?:\s+-C\s+\S+)?\s+push\b([^;&|]*)/)
  if (!push || /--delete|--tags|\s-d\b/.test(push[1]!)) return
  const r = await repoBilgisi($, gitKlasoru(komut, await $.session.cwd()))
  if (!r?.slug) return
  const konum = push[1]!.trim().split(/\s+/).filter(a => a && !a.startsWith('-'))
  const branch = konum[1]?.split(':').pop() ?? (await calistir($, ['git', 'branch', '--show-current'], r.dir)).out
  if (!branch || branch === 'main') return
  const s = await calistir($, ['gh', 'pr', 'list', '--repo', r.slug, '--head', branch, '--state', 'open', '--json', 'number,url'])
  const pr = s.ok ? (JSON.parse(s.out || '[]') as { number: number; url: string }[])[0] : undefined
  if (pr) await izle($, r.slug, pr.number, pr.url)
}

async function sonuc($: $T, i: CiIzleme, metin: string, kirmizi: boolean) {
  $.ui.toast(metin, { timeoutMs: 10_000 })
  await $.ui.notify(metin, { title: kirmizi ? 'CI kırmızı' : 'CI yeşil' }).catch(() => {})
  notEkle(`[genel/ci] ${metin} (${i.url})${kirmizi ? ' Kullanıcıya söyle; hata için: gh run view --repo ' + i.slug + ' --log-failed' : ''}`)
}

async function tur($: $T) {
  const liste = await read($, ci)
  if (liste.length === 0) return
  const simdi = await $.clock.now()
  const kalan: CiIzleme[] = []
  for (const i of liste) {
    const gecen = (simdi - i.basladi) / 1000
    const s = await calistir($, ['gh', 'pr', 'checks', String(i.no), '--repo', i.slug, '--json', 'name,bucket'])
    let kontroller: Kontrol[] = []
    try {
      kontroller = JSON.parse(s.out || '[]') as Kontrol[]
    } catch {
      kontroller = []
    }
    if (kontroller.length === 0) {
      // Bu repoda CI yok ya da henüz başlamadı.
      if (gecen < KONTROL_YOK_SN) kalan.push(i)
      continue
    }
    const bekleyen = kontroller.filter(k => k.bucket === 'pending')
    if (bekleyen.length > 0) {
      if (gecen < EN_UZUN_SN) kalan.push({ ...i, ozet: `${kontroller.length - bekleyen.length}/${kontroller.length}` })
      else $.ui.toast(`CI ${i.repo} #${i.no} bir saattir bitmedi; izleme bırakıldı`)
      continue
    }
    const kirmizi = kontroller.filter(k => k.bucket === 'fail' || k.bucket === 'cancel')
    if (kirmizi.length > 0) await sonuc($, i, `⛔ ${i.repo} PR #${i.no}: CI kırmızı (${kirmizi.map(k => k.name).join(', ')})`, true)
    else await sonuc($, i, `✅ ${i.repo} PR #${i.no}: CI yeşil (${kontroller.length} kontrol)`, false)
  }
  await update($, ci, () => kalan)
  durumYaz($, 'ci', kalan.length ? 'CI ' + kalan.map(i => `${i.repo} #${i.no} ⏳${i.ozet ? ' ' + i.ozet : ''}`).join(', ') : undefined)
}

// main'in son tamamlanan CI koşusu: kırmızıya dönen repo bildirilir, bantta durur.
async function mainTur($: $T) {
  if (!(await acik($, 'ci'))) return update($, mainKirmizi, () => [])
  const kirmizi: string[] = []
  for (const r of (await kapsamRepolar($)).filter(x => x.slug)) {
    // Yalnız main'e push'la tetiklenen koşular: Dependabot ve zamanlanmış işler main'in sağlığını göstermez.
    const s = await calistir($, ['gh', 'run', 'list', '--repo', r.slug, '--branch', 'main', '--event', 'push', '--status', 'completed', '--limit', '1', '--json', 'conclusion'])
    try {
      const son = (JSON.parse(s.out || '[]') as { conclusion: string }[])[0]
      if (son && ['failure', 'timed_out', 'startup_failure'].includes(son.conclusion)) kirmizi.push(r.ad)
    } catch {}
  }
  const once = await read($, mainKirmizi)
  const yeni = kirmizi.filter(k => !once.includes(k))
  if (yeni.length) {
    $.ui.toast(`⛔ main kırmızı: ${yeni.join(', ')}`, { timeoutMs: 10_000 })
    notEkle(`[genel/ci] ${yeni.join(', ')} main CI'ı kırmızı; bu repolarda PR merge etmeden önce kullanıcıya söyle.`)
  }
  await update($, mainKirmizi, () => kirmizi)
}

export function ciBaslat($: $T) {
  $.clock.every(60_000, () => tur($).catch(() => {}))
  mainTur($).catch(() => {})
  $.clock.every(10 * 60_000, () => mainTur($).catch(() => {}))
}

export async function ciOzeti($: $T): Promise<string | null> {
  const liste = await read($, ci)
  return liste.length ? liste.map(i => `${i.repo} PR #${i.no} CI sürüyor`).join(', ') : null
}

export async function kirmiziBant($: $T, e: RenderInput<'AbovePrompt'>) {
  const kirmizi = await read($, mainKirmizi)
  if (kirmizi.length === 0) return null
  const { Text } = $.ui.resolve(e)
  return <Text color="error" wrap="truncate-end">⛔ main kırmızı: {kirmizi.join(', ')}</Text>
}
