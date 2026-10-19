
import { acik } from './ayar'
import { durumYaz } from './durum'
import { calistir } from './ortak'
import type { $T } from './ortak'
import { macIp, metroAcik, sunucuPortu, tabletAl } from './tablet'

// Ön yüz geliştirme sunucuları (React, Vite, Next, Angular).
const ON_YUZ = [3000, 3001, 5173, 4200]
let sonIp: string | null = null

export function ortamSatiri(o: { ip: string | null; sunucu: number | null; metro: number[]; onYuz: number[]; tabletVar: boolean }): string | undefined {
  const parca: string[] = []
  if (!o.tabletVar) {
    if (o.sunucu) parca.push(`sunucu :${o.sunucu}`)
    if (o.metro.length) parca.push(`Metro :${o.metro.join('/')}`)
  }
  if (o.onYuz.length) parca.push(`web :${o.onYuz.join('/')}`)
  if (o.sunucu && o.ip) parca.push(`API ${o.ip}:${o.sunucu}`)
  return parca.length ? `🖥 ${parca.join(' · ')}` : undefined
}

async function tur($: $T) {
  if (!(await acik($, 'ortam'))) return durumYaz($, 'ortam', undefined)
  const [ip, sunucu, m81, m82, ...web] = await Promise.all([
    macIp($),
    sunucuPortu($),
    metroAcik($, 8081),
    metroAcik($, 8082),
    ...ON_YUZ.map(p => calistir($, ['lsof', '-nP', `-iTCP:${p}`, '-sTCP:LISTEN'])),
  ])
  const t = await tabletAl($)
  durumYaz($, 'ortam', ortamSatiri({
    ip, sunucu, onYuz: ON_YUZ.filter((_, i) => web[i]?.ok && web[i]?.out),
    metro: [m81 ? 8081 : 0, m82 ? 8082 : 0].filter(Boolean),
    tabletVar: Boolean(t?.bagli),
  }))
  // Konum değişince telefona yazılan Test API adresi de değişir.
  if (ip && sonIp && ip !== sonIp && sunucu) {
    $.ui.toast(`🖥 Ağ değişti: Test API artık http://${ip}:${sunucu}`, { timeoutMs: 15_000 })
  }
  if (ip) sonIp = ip
}

export function ortamBaslat($: $T) {
  tur($).catch(() => {})
  $.clock.every(30_000, () => tur($).catch(() => {}))
}
