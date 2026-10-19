import type { Register } from 'claude-code'

import { adimAraci, adimBant, adimSor, adimTemizle, ADIM_SOR } from './adim'
import { acik, ayarKomut, ayarYukle, genelKomutu } from './ayar'
import { bekliyorHaberi } from './bildirim'
import { bittiHaberi } from './bitti'
import { ciBaslat, ciSonrasi, kirmiziBant } from './ci'
import { devirSikistir } from './devir'
import { notEkle, notlariAl } from './durum'
import { envBaslat, envDokunus } from './env'
import { formatla } from './format'
import { hataHafizasi } from './hata'
import { kaldikBaglami, kaldikBaslat, kaldikBant, kaldikKapat } from './kaldik'
import { kartBaslat, kartCiz, kartKaydet, kartSay } from './kart'
import { komutKlasoru, repoBilgisi } from './ortak'
import { ortamBaslat } from './ortam'
import { portBant, portCakismasi } from './port'
import { tabletBaslat, tabletKaydet, tabletKomutu, tabletPrompt } from './tablet'
import { TAKIP_EKLE, TAKIP_KAPAT, takipAraclari, takipEkle, takipKapat, takipKomut, takipKomutu, takipPrNotu, takipYukle } from './takip'
import { telefonKomut, telefonKomutu } from './telefon'
import { temizleKomut, temizleKomutu } from './temizlik'
import { testIcinIsaretle, testKullaniciMesaji, testTuru } from './test'

const DOSYA_ARACLARI = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const ARAC = (ad: string) => new RegExp(`^mcp__genel__${ad}$`)
const KOMUTLAR = [genelKomutu, tabletKomutu, takipKomutu, temizleKomutu, telefonKomutu]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await ayarYukle($)
    for (const komut of KOMUTLAR) await $.command.register(komut)
    await takipYukle($)
    await takipAraclari($).catch(() => {})
    await adimAraci($).catch(() => {})
    tabletBaslat($)
    ciBaslat($)
    ortamBaslat($)
    // Ağ ve git işi bekletmesin: oturum hemen açılır, sonuçlar gelince bantta görünür.
    kaldikBaslat($).catch(() => {})
    envBaslat($).then(n => n.forEach(notEkle)).catch(() => {})
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'composer') testKullaniciMesaji()
    if (!e.isMeta && !e.command) {
      kartBaslat()
      await adimTemizle($)
      const kaldik = await kaldikBaglami($)
      if (kaldik) notEkle(kaldik)
      await kaldikKapat($)
    }
    return tabletPrompt($, e, ev => {
      const notlar = notlariAl()
      return next(notlar.length ? { ...ev, context: [...(ev.context ?? []), ...notlar] } : ev)
    })
  })

  tabletKaydet(on)

  on('command.run', { command: 'genel' }, async ($, e) => ({ text: await ayarKomut($, e.args) }))
  on('command.run', { command: 'takip' }, async ($, e) => ({ text: await takipKomut($, e.args) }))
  on('command.run', { command: 'temizle' }, async $ => ({ text: await temizleKomut($) }))
  on('command.run', { command: 'telefon' }, async ($, e) => ({ text: await telefonKomut($, e.args) }))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      await kartKaydet($, e.durationMs).catch(() => {})
      // Testler uzun sürebilir: tur bekletilmez, sonuç gelince bildirilir.
      if (!e.isAborted) testTuru($).catch(() => {})
    }
    const r = await next(e)
    await bittiHaberi($, e, r.text).catch(() => {})
    return r
  })

  on('session.compact', ($, e, next) => devirSikistir($, e, next))

  // İzin ya da cevap beklerken Claude Code'un kendi bildirim olayı.
  on('classic.Notification', async ($, e, next) => {
    await bekliyorHaberi($, e).catch(() => {})
    return next(e)
  })

  // Claude Code'un süre satırı yerine tur kartı.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => (await kartCiz($, e).catch(() => null)) ?? next(e))

  // Prompt üstü: düğmeler, port uyarısı, nerede kaldık, main kırmızı; altında diğer eklentilerin bandı.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const benim = [await adimBant($, e), await portBant($, e), await kaldikBant($, e), await kirmiziBant($, e)].filter(p => p !== null)
    if (benim.length === 0) return next(e)
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {benim}
        {await next(e)}
      </Box>
    )
  })

  // Modun Claude'a açtığı araçlar.
  on('tool.call', { tool: ARAC(TAKIP_EKLE) }, async ($, e) => ({ result: await takipEkle($, e as Record<string, unknown>) }))
  on('tool.call', { tool: ARAC(TAKIP_KAPAT) }, async ($, e) => ({ result: await takipKapat($, Number((e as Record<string, unknown>).id)) }))
  on('tool.call', { tool: ARAC(ADIM_SOR) }, async ($, e) => ({ result: await adimSor($, e as Record<string, unknown>) }))

  on('tool.call', async ($, e, next) => {
    if (e.tool.startsWith('mcp__genel__')) return next(e)
    const yol = DOSYA_ARACLARI.includes(e.tool) && 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : null
    const notlar: string[] = []
    if (yol && !e.agentId) {
      const n = await envDokunus($, yol).catch(() => null)
      if (n) notlar.push(n)
    }

    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    // Komut çalıştı: buradan sonra bir hata komutu ikinci kez çalıştırmasın diye sonuç her durumda döner.
    try {
      if (!e.agentId) kartSay(e, Boolean(ran.isError))
      if (yol && !e.agentId && !ran.isError && ['Edit', 'MultiEdit', 'Write'].includes(e.tool)) {
        const f = await formatla($, yol).catch(() => null)
        if (f) notlar.push(f)
        await testIcinIsaretle($, yol).catch(() => {})
      }
      if (e.tool === 'Bash') {
        const sonuc = (ran.result ?? {}) as { stdout?: unknown; stderr?: unknown }
        const cikti = ran.text ?? `${sonuc.stdout ?? ''}\n${sonuc.stderr ?? ''}`
        ciSonrasi($, e.command, cikti).catch(() => {})
        if (ran.isError && !e.agentId) {
          for (const n of await Promise.all([portCakismasi($, cikti), hataHafizasi($, cikti)].map(p => p.catch(() => null)))) if (n) notlar.push(n)
        }
        if (/\bgh\s+pr\s+create\b/.test(e.command) && (await acik($, 'takip'))) {
          const r = await repoBilgisi($, komutKlasoru(e.command, await $.session.cwd()))
          const tk = await takipPrNotu($, r?.ad)
          if (tk) notlar.push(tk)
        }
      }
      notlar.push(...notlariAl())
      return notlar.length ? { ...ran, context: [...(ran.context ?? []), ...notlar] } : ran
    } catch {
      return ran
    }
  }).catch(($, e, next) => next(e))
}
