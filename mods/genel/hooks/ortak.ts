import type { EngineInterface } from 'claude-code'

export type $T = EngineInterface

export type Cikti = { ok: boolean; out: string; err: string }

// Komut başlayamazsa ya da zaman aşarsa reddetmek yerine ok:false döner.
export async function calistir($: $T, argv: readonly string[], cwd?: string, timeoutMs = 20_000): Promise<Cikti> {
  try {
    const r = await $.process.run(argv, { cwd, timeoutMs })
    return { ok: r.exitCode === 0, out: r.stdout.trim(), err: r.stderr.trim() }
  } catch (hata) {
    return { ok: false, out: '', err: String(hata) }
  }
}

export function bekle($: $T, sn: number) {
  return calistir($, ['sleep', String(sn)])
}

export async function dosyaOku($: $T, yol: string): Promise<string | null> {
  try {
    return await $.fs.read(yol)
  } catch {
    return null
  }
}

export const adi = (yol: string) => yol.slice(yol.lastIndexOf('/') + 1)

export type Repo = { ad: string; dir: string; slug: string; uzak: string }

// Klasörün git kökü ve GitHub adı; fork'ta çalışılıyorsa asıl repo (upstream) esas alınır.
const repoOnbellek = new Map<string, Repo | null>()

export async function repoBilgisi($: $T, yol: string): Promise<Repo | null> {
  const kok = (await calistir($, ['git', 'rev-parse', '--show-toplevel'], yol)).out
  if (!kok) return null
  if (repoOnbellek.has(kok)) return repoOnbellek.get(kok)!
  const uzaklar = (await calistir($, ['git', 'remote'], kok)).out.split('\n')
  const uzak = uzaklar.includes('upstream') ? 'upstream' : uzaklar.includes('origin') ? 'origin' : ''
  const url = uzak ? (await calistir($, ['git', 'remote', 'get-url', uzak], kok)).out : ''
  const slug = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? ''
  const r = { ad: adi(kok), dir: kok, slug, uzak }
  repoOnbellek.set(kok, r)
  return r
}

// Oturumun kapsamındaki repolar: çalışma klasörünün kendisi bir repoysa o, değilse altındaki repolar (birden çok repoyu tutan bir klasör).
export async function kapsamRepolar($: $T): Promise<Repo[]> {
  const cwd = await $.session.cwd()
  const kendi = await repoBilgisi($, cwd)
  if (kendi) return [kendi]
  const sonuc: Repo[] = []
  for (const giris of await $.fs.list(cwd).catch(() => [])) {
    if (giris.kind !== 'dir' || !(await $.fs.exists(`${cwd}/${giris.name}/.git`))) continue
    const r = await repoBilgisi($, `${cwd}/${giris.name}`)
    if (r && !sonuc.some(x => x.dir === r.dir)) sonuc.push(r)
  }
  return sonuc
}

// Bash komutunun hangi klasörde çalışacağı: son `cd X` ya da `git -C X`, yoksa oturumun klasörü.
export function komutKlasoru(komut: string, cwd: string): string {
  let dir = cwd
  for (const m of komut.matchAll(/(?:^|&&|;|\|\|)\s*cd\s+("[^"]+"|'[^']+'|\S+)/g)) {
    const hedef = m[1]!.replace(/^["']|["']$/g, '')
    dir = hedef.startsWith('/') ? hedef : `${dir}/${hedef}`
  }
  const parcalar: string[] = []
  for (const p of dir.split('/')) {
    if (p === '..') parcalar.pop()
    else if (p !== '' && p !== '.') parcalar.push(p)
  }
  return '/' + parcalar.join('/')
}

export function gitKlasoru(komut: string, cwd: string): string {
  const dir = komutKlasoru(komut, cwd)
  const c = komut.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)?.[1]?.replace(/^["']|["']$/g, '')
  return c ? komutKlasoru(`cd "${c}"`, dir) : dir
}

// Claude Code'un oturum kayıtlarını tuttuğu klasör adı: harf ve rakam dışı her karakter "-".
export function projeKlasoru(home: string, cwd: string): string {
  return `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}`
}
