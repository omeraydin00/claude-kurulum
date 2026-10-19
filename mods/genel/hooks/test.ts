import { acik } from './ayar'
import { durumYaz } from './durum'
import { adi, dosyaOku, repoBilgisi } from './ortak'
import type { $T } from './ortak'

// Proof of Done: kod düzenlenen turun sonunda projenin kendi testleri; kırılırsa Claude'a geri gönderilir.
const KOD_DEGIL = /\.(md|mdx|txt|png|jpe?g|gif|svg|webp|ico|lock|log)$/i
const EN_COK_DENEME = 2

const degisen = new Set<string>()
const suren = new Set<string>()
let deneme = 0

export async function testKomutu($: $T, dir: string): Promise<string[] | null> {
  const pkg = await dosyaOku($, `${dir}/package.json`)
  if (pkg) {
    let test = ''
    try {
      test = (JSON.parse(pkg) as { scripts?: Record<string, string> }).scripts?.test ?? ''
    } catch {}
    if (!test || /no test specified/.test(test)) return null
    if ((await $.fs.exists(`${dir}/bun.lock`)) || (await $.fs.exists(`${dir}/bun.lockb`))) return ['bun', 'run', 'test']
    if (await $.fs.exists(`${dir}/pnpm-lock.yaml`)) return ['pnpm', 'test']
    if (await $.fs.exists(`${dir}/yarn.lock`)) return ['yarn', 'test']
    return ['npm', 'test', '--silent']
  }
  const py = (await dosyaOku($, `${dir}/pyproject.toml`)) ?? ''
  if (/\[tool\.pytest/.test(py) || (await $.fs.exists(`${dir}/pytest.ini`)) || (await $.fs.exists(`${dir}/tests/conftest.py`))) return ['python3', '-m', 'pytest', '-q', '-x']
  if (await $.fs.exists(`${dir}/go.mod`)) return ['go', 'test', './...']
  if (await $.fs.exists(`${dir}/Cargo.toml`)) return ['cargo', 'test', '-q']
  return null
}

// Düzenlemeden sonra: kod dosyasıysa reposu tur sonunda test edilecekler listesine girer.
export async function testIcinIsaretle($: $T, yol: string) {
  if (KOD_DEGIL.test(yol) || !(await acik($, 'test'))) return
  const r = await repoBilgisi($, yol.slice(0, yol.lastIndexOf('/')) || '/')
  if (r) degisen.add(r.dir)
}

// Kullanıcı kendisi yazınca otomatik düzeltme hakkı yenilenir.
export function testKullaniciMesaji() {
  deneme = 0
}

export function sonSatirlar(metin: string, n = 60): string {
  return metin.split('\n').slice(-n).join('\n')
}

export async function testTuru($: $T): Promise<void> {
  const dizinler = [...degisen].filter(d => !suren.has(d))
  degisen.clear()
  for (const dir of dizinler) {
    const argv = await testKomutu($, dir)
    if (!argv) continue
    suren.add(dir)
    durumYaz($, 'test', `🧪 ${adi(dir)} testleri…`)
    try {
      const r = await calistirTest($, argv, dir)
      if (r.ok) {
        $.ui.toast(`🧪 ${adi(dir)}: testler geçti`)
        continue
      }
      const cikti = sonSatirlar([r.out, r.err].filter(Boolean).join('\n'))
      if (deneme >= EN_COK_DENEME) {
        $.ui.toast(`🧪 ${adi(dir)}: testler hâlâ kırık; otomatik düzeltme durdu`, { timeoutMs: 10_000 })
        continue
      }
      deneme++
      $.ui.toast(`🧪 ${adi(dir)}: testler kırık, Claude'a geri gönderildi`, { timeoutMs: 8_000 })
      await $.prompt.submit({
        text: `[genel/test] ${adi(dir)} içinde kod değişti ve testler kırıldı (\`${argv.join(' ')}\`). Hatanın son satırları:\n\`\`\`\n${cikti}\n\`\`\`\nDeğişikliğin testi bozduysa düzelt. Test zaten önceden kırıksa ya da değişikliğinle ilgisi yoksa düzeltmeye çalışma, kullanıcıya söyle.`,
      })
    } finally {
      suren.delete(dir)
      durumYaz($, 'test', undefined)
    }
  }
}

function calistirTest($: $T, argv: string[], dir: string) {
  // CI=1: jest/vitest izleme moduna girmesin.
  return $.process
    .run(argv, { cwd: dir, env: { CI: '1' }, timeoutMs: 10 * 60_000 })
    .then(r => ({ ok: r.exitCode === 0, out: r.stdout.trim(), err: r.stderr.trim() }))
    .catch(h => ({ ok: false, out: '', err: String(h) }))
}

