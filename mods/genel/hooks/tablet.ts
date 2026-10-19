import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { PromptSubmitInput, PromptSubmitResult } from 'claude-code'

import type { TabletDurum } from '../types'
import { acik } from './ayar'
import { durumYaz } from './durum'
import { bekle, calistir } from './ortak'
import type { $T } from './ortak'

export const tablet = atom({ plugin: 'genel', key: 'tablet' } as const, null)

// Sık kullanılan arka uç portları; açık olan ilk port telefona da açılır ve "Test API" olarak gösterilir.
export const SUNUCU_PORTLARI = [5003, 5002, 5001, 5000, 8000, 8080, 4000]
// Dev paketi (".dev" son ekli) Metro'yu 8082'de bekler; 8081 başka projenin Metro'suna kalır.
const DEV_METRO = 8082

export type BaglantiIstegi = { ip: string; port: string; kod: string | null; geriKalan: string }

// "10.0.0.12:36409 KOD 904677 bağlan" ve benzerleri. Uzun yapıştırmalarda (log vb.) tetiklenmez.
export function baglantiCoz(metin: string): BaglantiIstegi | null {
  if (metin.length > 300) return null
  const m = metin.match(/(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})(?:\s*(?:kod|code|KOD|Kod)?\s*[:=]?\s*(\d{6})\b)?/)
  if (!m) return null
  if (!m[3] && !/bağlan|baglan|connect/i.test(metin)) return null
  const geriKalan = metin
    .replace(m[0], ' ')
    .replace(/\b(kod|code|ve|hadi|lütfen|lutfen)\b/gi, ' ')
    .replace(/bağlan\p{L}*|baglan\p{L}*|telefon\p{L}*|tablet\p{L}*|connect/giu, ' ')
    .replace(/[\s.,!?]+/g, ' ')
    .trim()
  return { ip: m[1]!, port: m[2]!, kod: m[3] ?? null, geriKalan }
}

async function baglantiPortuBul($: $T, ip: string): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    const { out } = await calistir($, ['adb', 'mdns', 'services'])
    for (const satir of out.split('\n')) {
      if (!satir.includes('tls-connect')) continue
      const adres = satir.match(/(\d{1,3}(?:\.\d{1,3}){3}):(\d+)/)
      if (adres && adres[1] === ip) return adres[2]!
    }
    await bekle($, 2)
  }
  return null
}

export async function sunucuPortu($: $T): Promise<number | null> {
  for (const port of SUNUCU_PORTLARI) {
    const r = await calistir($, ['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN'])
    if (r.ok && r.out) return port
  }
  return null
}

// Metro'yu ve test sunucusunu cihaza açar: hangi Metro açıksa ona; ikisi de açıksa .dev paketli cihazda 8082.
async function portlariAc($: $T, serial: string): Promise<{ metro: string; sunucuPort: number | null }> {
  const [m81, m82] = await Promise.all([metroAcik($, 8081), metroAcik($, DEV_METRO)])
  const devPaket = /\.dev$/m.test((await calistir($, ['adb', '-s', serial, 'shell', 'pm', 'list', 'packages', '-3'])).out)
  const metroHost = m82 && (!m81 || devPaket) ? DEV_METRO : 8081
  await calistir($, ['adb', '-s', serial, 'reverse', 'tcp:8081', `tcp:${metroHost}`])
  const sunucuPort = await sunucuPortu($)
  if (sunucuPort) await calistir($, ['adb', '-s', serial, 'reverse', `tcp:${sunucuPort}`, `tcp:${sunucuPort}`])
  return { metro: `8081→${metroHost}`, sunucuPort }
}

export async function baglan($: $T, istek: BaglantiIstegi): Promise<{ durum?: TabletDurum; hata?: string }> {
  let port = istek.port
  if (istek.kod) {
    const eslesme = await calistir($, ['adb', 'pair', `${istek.ip}:${istek.port}`, istek.kod])
    if (!/Successfully paired/i.test(eslesme.out + eslesme.err)) {
      return { hata: `eşleştirme olmadı: ${(eslesme.out || eslesme.err).split('\n').pop()}` }
    }
    const bulunan = await baglantiPortuBul($, istek.ip)
    if (!bulunan) return { hata: 'eşleşti ama bağlantı portu mDNS’te görünmedi' }
    port = bulunan
  }
  const serial = `${istek.ip}:${port}`
  const baglanti = await calistir($, ['adb', 'connect', serial])
  if (!/connected to/i.test(baglanti.out)) return { hata: `bağlanamadı: ${baglanti.out || baglanti.err}` }
  const model = (await calistir($, ['adb', '-s', serial, 'shell', 'getprop', 'ro.product.model'])).out || 'cihaz'
  const { metro, sunucuPort } = await portlariAc($, serial)
  const durum: TabletDurum = { serial, model, metro, sunucuPort, bagli: true }
  await $.store.set('tablet.son', durum)
  return { durum }
}

export async function macIp($: $T): Promise<string | null> {
  for (const arayuz of ['en0', 'en1']) {
    const r = await calistir($, ['ipconfig', 'getifaddr', arayuz])
    if (r.ok && r.out) return r.out
  }
  return null
}

export async function metroAcik($: $T, port: number): Promise<boolean> {
  try {
    const r = await $.http.fetch(`http://localhost:${port}/status`)
    return r.text.includes('running')
  } catch {
    return false
  }
}

export async function tabletAl($: $T): Promise<TabletDurum | null> {
  return read($, tablet)
}

export function durumSatiri(d: TabletDurum, metroCalisiyor: boolean | null): string {
  if (!d.bagli) return `📱 ${d.model} bağlantısı koptu · yeni kodu yapıştır ya da /tablet`
  const metro = metroCalisiyor === null ? d.metro : `${d.metro} ${metroCalisiyor ? '✓' : '✗ kapalı'}`
  const sunucu = d.sunucuPort ? ` · sunucu :${d.sunucuPort}` : ' · sunucu kapalı'
  return `📱 ${d.model} ${d.serial} · Metro ${metro}${sunucu}`
}

async function yenile($: $T) {
  const d = await read($, tablet)
  if (!d) return
  if (!(await acik($, 'tablet'))) return durumYaz($, 'tablet', undefined)
  const cihazlar = (await calistir($, ['adb', 'devices'])).out
  const bagli = cihazlar.split('\n').some(s => s.startsWith(d.serial) && /\tdevice$/.test(s))
  const hostPort = Number(d.metro.split('→')[1] ?? 8081)
  const yeni = { ...d, bagli }
  if (bagli !== d.bagli) await update($, tablet, () => yeni)
  durumYaz($, 'tablet', durumSatiri(yeni, await metroAcik($, hostPort)))
}

export const tabletKomutu = {
  name: 'tablet',
  description: 'Tablet/telefon bağlantısını, Metro ve sunucu portlarını gösterir; kopmuşsa yeniden bağlar',
}

export function tabletBaslat($: $T) {
  $.clock.every(30_000, () => yenile($).catch(() => {}))
}

// Yapıştırılan bağlantı satırı. prompt.submit kaydı register.tsx'te (notlarla birlikte).
export async function tabletPrompt(
  $: $T,
  e: PromptSubmitInput,
  next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>,
): Promise<PromptSubmitResult> {
    if (e.command || e.isMeta || !(await acik($, 'tablet'))) return next(e)
    const istek = baglantiCoz(e.text)
    if (!istek) return next(e)

    durumYaz($, 'tablet', `📱 ${istek.ip} bağlanıyor…`)
    const { durum, hata } = await baglan($, istek)
    if (durum) {
      await update($, tablet, () => durum)
      durumYaz($, 'tablet', durumSatiri(durum, null))
      if (!istek.geriKalan) return { drop: `📱 Bağlandı: ${durum.model} ${durum.serial} · Metro ${durum.metro}${durum.sunucuPort ? ` · sunucu :${durum.sunucuPort}` : ''}` }
      return next({
        ...e,
        context: [
          ...(e.context ?? []),
          `[genel/tablet] Cihaz zaten bağlandı, eşleştirme/bağlanma adımlarını tekrar yapma: serial ${durum.serial} (${durum.model}); adb komutlarında -s ${durum.serial} kullan. adb reverse yapıldı: Metro ${durum.metro}${durum.sunucuPort ? `, sunucu ${durum.sunucuPort}` : ''}.`,
        ],
      })
    }
    durumYaz($, 'tablet', undefined)
    $.ui.toast(`📱 Otomatik bağlantı olmadı: ${hata}`)
    return next({
      ...e,
      context: [...(e.context ?? []), `[genel/tablet] Otomatik bağlantı denendi ve olmadı (${hata}). Elle dene.`],
    })
}

// /tablet; session.start register.tsx'te tek yerde.
export function tabletKaydet(on: On) {

  on('command.run', { command: 'tablet' }, async $ => {
    let d = (await read($, tablet)) ?? ((await $.store.get('tablet.son')) as TabletDurum | undefined) ?? null
    const ip = await macIp($)
    const testApi = ip ? `Telefona yazılacak test API: http://${ip}:${(await sunucuPortu($)) ?? '—'}` : 'Mac’in ağ adresi bulunamadı'
    if (!d) return { text: `Bağlı cihaz yok. "IP:port kod NNNNNN" satırını yapıştırman yeterli.\n${testApi}` }

    const cihazlar = (await calistir($, ['adb', 'devices'])).out
    if (!cihazlar.includes(`${d.serial}\tdevice`)) {
      const tekrar = await calistir($, ['adb', 'connect', d.serial])
      if (!/connected to/i.test(tekrar.out)) {
        d = { ...d, bagli: false }
        await update($, tablet, () => d)
        return { text: `${durumSatiri(d, null)}\nYeniden bağlanma olmadı (port değişmiş olabilir).\n${testApi}` }
      }
    }
    const { metro, sunucuPort } = await portlariAc($, d.serial)
    d = { ...d, metro, sunucuPort, bagli: true }
    await update($, tablet, () => d)
    const metroCalisiyor = await metroAcik($, Number(metro.split('→')[1]))
    durumYaz($, 'tablet', durumSatiri(d, metroCalisiyor))
    return { text: `${durumSatiri(d, metroCalisiyor)}\nadb reverse yenilendi.\n${testApi}` }
  })
}
