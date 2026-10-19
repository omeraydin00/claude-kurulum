import { acik } from './ayar'
import { adi, calistir, dosyaOku, repoBilgisi } from './ortak'
import type { $T } from './ortak'

// Yalnız projenin kendi kullandığı formatlayıcı: yapılandırması ya da bağımlılığı yoksa dokunulmaz.
const PRETTIER_UZANTI = /\.(tsx?|jsx?|mjs|cjs|css|scss|json|md|html|ya?ml|vue|svelte)$/
const PRETTIER_AYAR = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.yaml', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs']

export async function formatlayici($: $T, kok: string, yol: string): Promise<string[] | null> {
  if (PRETTIER_UZANTI.test(yol)) {
    const pkg = (await dosyaOku($, `${kok}/package.json`)) ?? ''
    const ayarli = /"prettier"\s*:/.test(pkg) || (await Promise.all(PRETTIER_AYAR.map(a => $.fs.exists(`${kok}/${a}`)))).some(Boolean)
    if (ayarli && (await $.fs.exists(`${kok}/node_modules/.bin/prettier`))) return [`${kok}/node_modules/.bin/prettier`, '--write', '--log-level', 'warn', yol]
    return null
  }
  if (yol.endsWith('.py')) {
    const py = (await dosyaOku($, `${kok}/pyproject.toml`)) ?? ''
    if (/\[tool\.ruff/.test(py) || (await $.fs.exists(`${kok}/ruff.toml`))) return ['ruff', 'format', yol]
    if (/\[tool\.black\]/.test(py)) return ['black', '-q', yol]
    return null
  }
  if (yol.endsWith('.go')) return ['gofmt', '-w', yol]
  if (yol.endsWith('.rs') && (await $.fs.exists(`${kok}/Cargo.toml`))) return ['rustfmt', '--edition', '2021', yol]
  return null
}

// Düzenlemeden sonra: dosya değiştiyse Claude bir sonraki düzenlemeden önce yeniden okumalı.
export async function formatla($: $T, yol: string): Promise<string | null> {
  if (!(await acik($, 'format'))) return null
  const r = await repoBilgisi($, yol.slice(0, yol.lastIndexOf('/')) || '/')
  if (!r) return null
  const argv = await formatlayici($, r.dir, yol)
  if (!argv) return null
  const once = await dosyaOku($, yol)
  const sonuc = await calistir($, argv, r.dir, 30_000)
  if (!sonuc.ok) return null
  if ((await dosyaOku($, yol)) === once) return null
  return `[genel/format] ${adi(yol)} projenin formatlayıcısıyla (${adi(argv[0]!)}) düzenlendi; aynı dosyayı yeniden düzenlemeden önce oku.`
}
