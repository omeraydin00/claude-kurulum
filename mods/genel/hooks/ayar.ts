import { atom, read, update } from 'claude-code'

import type { Ayarlar } from '../types'
import type { $T } from './ortak'

export type Parca = keyof Ayarlar

export const PARCALAR: Record<Parca, string> = {
  kaldik: 'Nerede kaldık: projeyi açınca son oturumun özeti ve yarım kalan iş',
  hata: 'Hata hafızası: aynı hata eski oturumlarda çözüldüyse hatırlatır',
  bitti: 'Bitince haber ver: uzun iş bitince bildirim',
  ses: 'Sesli haber: bitince "bitti", beklerken "seni bekliyor" der',
  bekliyor: 'Seni bekliyor: izin ya da cevap beklerken masaüstü bildirimi',
  kart: 'Tur sonu kartı: süre, dosya, satır ve komut sayısı',
  format: 'Otomatik format: düzenlenen dosyaya projenin formatlayıcısı',
  test: 'Proof of Done: kod değişen turun sonunda testler; kırılırsa Claude düzeltir',
  telefon: 'Telefona bildirim (ntfy): /telefon ile kurulur',
  takip: 'Takip: denenmedi / deploy sonrası listesi (/takip)',
  adim: 'Tek tıklık cevap düğmeleri: Yaptım / Olmadı',
  devir: 'Bağlam koruma: sıkıştırmada PR’lar, kararlar ve sorular korunur',
  ci: 'CI izleyici ve main kırmızı uyarısı',
  tablet: 'Telefon/tablet köprüsü: "IP:port kod" yapıştırınca bağlanır',
  ortam: 'Ortam: açık dev sunucuları ve telefondan erişilecek adres',
  port: 'Port çakışması: portu tutan programı gösterir, kapatma düğmesi',
  env: '.env denetimi: .env.example’da olup .env’de eksik değişkenler',
}

const VARSAYILAN: Ayarlar = {
  kaldik: true, hata: true, bitti: true, ses: false, bekliyor: true, kart: true, format: true, test: true, telefon: false, takip: true, adim: true,
  devir: true, ci: true, tablet: true, ortam: true, port: true, env: true,
}

export const ayarlar = atom({ plugin: 'genel', key: 'ayarlar' } as const, VARSAYILAN)

export async function ayarYukle($: $T) {
  const kayitli = (await $.store.get('ayarlar')) as Partial<Ayarlar> | undefined
  await update($, ayarlar, () => ({ ...VARSAYILAN, ...kayitli }))
}

export async function acik($: $T, parca: Parca): Promise<boolean> {
  return (await read($, ayarlar))[parca]
}

// Komutların açıp kapattığı tek parça (ör. /telefon).
export async function parcaAyarla($: $T, parca: Parca, deger: boolean) {
  const yeni = { ...(await read($, ayarlar)), [parca]: deger }
  await update($, ayarlar, () => yeni)
  await $.store.set('ayarlar', yeni)
}

export const genelKomutu = {
  name: 'genel',
  description: 'genel modunun parçalarını listeler; "/genel kapat test", "/genel ac ses", "/genel kapat hepsi"',
}

function liste(a: Ayarlar): string {
  return (Object.keys(PARCALAR) as Parca[]).map(p => `${a[p] ? '✓' : '✗'} ${p.padEnd(8)} ${PARCALAR[p]}`).join('\n')
}

export async function ayarKomut($: $T, args: string): Promise<string> {
  const [eylem = '', ...adlar] = args.trim().toLocaleLowerCase('tr').split(/\s+/).filter(Boolean)
  const simdiki = await read($, ayarlar)
  if (!eylem) return `${liste(simdiki)}\n\nDeğiştirmek için: /genel kapat <parça>  ·  /genel ac <parça>  (hepsi de olur)`

  const deger = ['ac', 'aç', 'on'].includes(eylem) ? true : ['kapat', 'off'].includes(eylem) ? false : null
  const hedef = adlar.includes('hepsi') ? (Object.keys(PARCALAR) as Parca[]) : adlar.filter((a): a is Parca => a in PARCALAR)
  const bilinmeyen = adlar.filter(a => a !== 'hepsi' && !(a in PARCALAR))
  if (deger === null || hedef.length === 0 || bilinmeyen.length > 0) {
    return `Anlamadım${bilinmeyen.length ? `: ${bilinmeyen.join(', ')}` : ''}. Parçalar: ${Object.keys(PARCALAR).join(', ')}, hepsi.\nÖrnek: /genel kapat test`
  }
  const yeni = { ...simdiki, ...Object.fromEntries(hedef.map(p => [p, deger])) } as Ayarlar
  await update($, ayarlar, () => yeni)
  await $.store.set('ayarlar', yeni)
  return `${hedef.join(', ')} ${deger ? 'açıldı' : 'kapatıldı'} (sonraki oturumlarda da geçerli).\n\n${liste(yeni)}`
}
