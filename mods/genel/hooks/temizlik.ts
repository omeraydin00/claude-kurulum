export type Temizlik = { repo: string; branch: string; sha: string; pr: number }

import { calistir, kapsamRepolar } from './ortak'
import type { $T } from './ortak'

type Silinen = Temizlik & { tamSha: string; fork: boolean; zaman: number }

// Merge olmuş PR'ın ucundaki branch'ler: yerel kopya, varsa fork'taki kopya. SHA'lar geri dönüş için saklanır.
export async function temizlikYap($: $T, liste: readonly Temizlik[]): Promise<string> {
  if (liste.length === 0) return 'Silinecek branch yok.'
  const cevap = await $.ui.ask(
    `${liste.length} branch silinecek (yerel + fork’taki kopya). PR’ları merge olmuş; SHA’lar kayda alınır, "git branch <ad> <sha>" ile geri gelir. Silinsin mi?`,
    ['Evet, sil', 'Vazgeç'],
  )
  if (!cevap.startsWith('Evet')) return 'Vazgeçildi.'
  const repoListe = await kapsamRepolar($)
  const silinen: Silinen[] = []
  const atlanan: string[] = []
  const zaman = await $.clock.now()
  for (const t of liste) {
    const r = repoListe.find(x => x.ad === t.repo)
    if (!r) continue
    const tamSha = (await calistir($, ['git', 'rev-parse', `refs/heads/${t.branch}`], r.dir)).out
    // Liste yenilendikten sonra branch'e commit geldiyse dokunulmaz.
    if (!tamSha.startsWith(t.sha) || (await calistir($, ['git', 'branch', '--show-current'], r.dir)).out === t.branch) {
      atlanan.push(`${t.repo} ${t.branch}`)
      continue
    }
    if (!(await calistir($, ['git', 'branch', '-D', t.branch], r.dir)).ok) {
      atlanan.push(`${t.repo} ${t.branch}`)
      continue
    }
    // origin yalnız upstream ayrıyken kişinin fork'udur; asıl repoda GitHub kendisi siler.
    let fork = false
    if (r.uzak === 'upstream') {
      const uzak = (await calistir($, ['git', 'ls-remote', 'origin', `refs/heads/${t.branch}`], r.dir)).out.split(/\s/)[0] ?? ''
      if (uzak && uzak === tamSha) fork = (await calistir($, ['git', 'push', 'origin', '--delete', t.branch], r.dir, 60_000)).ok
    }
    silinen.push({ ...t, tamSha, fork, zaman })
  }
  const gecmis = ((await $.store.get('temizlik.gecmis')) as Silinen[] | undefined) ?? []
  await $.store.set('temizlik.gecmis', [...gecmis, ...silinen].slice(-200))
  return [
    `✓ ${silinen.length} branch silindi${silinen.some(s => s.fork) ? ` (${silinen.filter(s => s.fork).length}’i fork’tan da)` : ''}.`,
    ...silinen.map(s => `  ${s.repo} ${s.branch} ${s.tamSha.slice(0, 9)}`),
    ...(atlanan.length ? [`Atlanan (değişmiş ya da üzerinde çalışılıyor): ${atlanan.join(', ')}`] : []),
  ].join('\n')
}

type GhPr = { number: number; state: string; headRefName: string; headRefOid: string }

// Merge olmuş PR'ının ucunda duran yerel branch'ler (açık PR'ı olan ve şu an üzerinde durulan hariç).
export async function temizlikListele($: $T): Promise<Temizlik[]> {
  const liste: Temizlik[] = []
  await Promise.all(
    (await kapsamRepolar($)).filter(r => r.slug).map(async r => {
      const s = await calistir($, ['gh', 'pr', 'list', '--repo', r.slug, '--author', '@me', '--state', 'all', '--limit', '100', '--json', 'number,state,headRefName,headRefOid'], undefined, 30_000)
      let prlar: GhPr[] = []
      try {
        prlar = JSON.parse(s.out || '[]') as GhPr[]
      } catch {}
      const simdiki = (await calistir($, ['git', 'branch', '--show-current'], r.dir)).out
      const yerel = (await calistir($, ['git', 'for-each-ref', 'refs/heads', '--format=%(refname:short) %(objectname)'], r.dir)).out
      for (const satir of yerel.split('\n').filter(Boolean)) {
        const [ad = '', sha = ''] = satir.split(' ')
        if (['main', 'master', simdiki].includes(ad)) continue
        const pr = prlar.find(p => p.headRefName === ad && p.state === 'MERGED' && p.headRefOid === sha)
        if (pr && !prlar.some(p => p.headRefName === ad && p.state === 'OPEN')) liste.push({ repo: r.ad, branch: ad, sha: sha.slice(0, 9), pr: pr.number })
      }
    }),
  )
  return liste
}

export const temizleKomutu = {
  name: 'temizle',
  description: 'PR’ı merge olmuş yerel (ve fork’taki) branch’leri listeler, onayınla siler',
}

export async function temizleKomut($: $T): Promise<string> {
  const liste = await temizlikListele($)
  if (liste.length === 0) return 'Silinebilecek branch yok.'
  const tablo = liste.map(t => `  ${t.repo.padEnd(24)} ${t.branch.padEnd(32)} ${t.sha}  PR #${t.pr} merged`).join('\n')
  return `${tablo}\n\n${await temizlikYap($, liste)}`
}
