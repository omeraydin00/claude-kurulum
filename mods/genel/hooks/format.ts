import { acik } from './ayar'
import { adi, calistir, dosyaOku, repoBilgisi } from './ortak'
import type { $T } from './ortak'

// Yalnız projenin kendi kullandığı formatlayıcı: yapılandırması ya da bağımlılığı yoksa dokunulmaz.
const PRETTIER_UZANTI = /\.(tsx?|jsx?|mjs|cjs|css|scss|json|md|html|ya?ml|vue|svelte)$/
const PRETTIER_AYAR = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.yaml', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs']

type Bicimci = { yaz: string[]; denetle: string[] }

export async function formatlayici($: $T, kok: string, yol: string): Promise<Bicimci | null> {
  if (PRETTIER_UZANTI.test(yol)) {
    const pkg = (await dosyaOku($, `${kok}/package.json`)) ?? ''
    const ayarli = /"prettier"\s*:/.test(pkg) || (await Promise.all(PRETTIER_AYAR.map(a => $.fs.exists(`${kok}/${a}`)))).some(Boolean)
    const p = `${kok}/node_modules/.bin/prettier`
    if (ayarli && (await $.fs.exists(p))) return { yaz: [p, '--write', '--log-level', 'warn', yol], denetle: [p, '--check', '--log-level', 'silent', yol] }
    return null
  }
  if (yol.endsWith('.py')) {
    const py = (await dosyaOku($, `${kok}/pyproject.toml`)) ?? ''
    if (/\[tool\.ruff/.test(py) || (await $.fs.exists(`${kok}/ruff.toml`))) return { yaz: ['ruff', 'format', yol], denetle: ['ruff', 'format', '--check', yol] }
    if (/\[tool\.black\]/.test(py)) return { yaz: ['black', '-q', yol], denetle: ['black', '-q', '--check', yol] }
    return null
  }
  if (yol.endsWith('.go')) return { yaz: ['gofmt', '-w', yol], denetle: ['sh', '-c', 'test -z "$(gofmt -l "$1")"', 'sh', yol] }
  if (yol.endsWith('.rs') && (await $.fs.exists(`${kok}/Cargo.toml`))) return { yaz: ['rustfmt', '--edition', '2021', yol], denetle: ['rustfmt', '--edition', '2021', '--check', yol] }
  return null
}

// Düzenlemeden önce: dosya zaten formatlıysa (ya da yeni dosyaysa) düzenlemeden sonra formatlanır.
// Formatsız dosyayı baştan sona biçimlendirmek PR'da ilgisiz yüzlerce satır fark çıkarır.
const formatlanacak = new Set<string>()

export async function formatOncesi($: $T, yol: string) {
  formatlanacak.delete(yol)
  if (!(await acik($, 'format'))) return
  const r = await repoBilgisi($, yol.slice(0, yol.lastIndexOf('/')) || '/')
  const b = r && (await formatlayici($, r.dir, yol))
  if (!r || !b) return
  if (!(await $.fs.exists(yol)) || (await calistir($, b.denetle, r.dir, 30_000)).ok) formatlanacak.add(yol)
}

// Düzenlemeden sonra: dosya değiştiyse Claude bir sonraki düzenlemeden önce yeniden okumalı.
export async function formatla($: $T, yol: string): Promise<string | null> {
  if (!formatlanacak.delete(yol) || !(await acik($, 'format'))) return null
  const r = await repoBilgisi($, yol.slice(0, yol.lastIndexOf('/')) || '/')
  if (!r) return null
  const b = await formatlayici($, r.dir, yol)
  if (!b) return null
  const argv = b.yaz
  const once = await dosyaOku($, yol)
  const sonuc = await calistir($, argv, r.dir, 30_000)
  if (!sonuc.ok) return null
  if ((await dosyaOku($, yol)) === once) return null
  return `[genel/format] ${adi(yol)} projenin formatlayıcısıyla (${adi(argv[0]!)}) düzenlendi; aynı dosyayı yeniden düzenlemeden önce oku.`
}
