import { acik, parcaAyarla } from './ayar'
import type { $T } from './ortak'

// Phone Buzz: ntfy ile telefona bildirim. İçerik gönderilmez; yalnız başlık ve proje adı.
const SUNUCU = 'https://ntfy.sh'

async function konuAl($: $T): Promise<string> {
  let konu = (await $.store.get('telefon.konu')) as string | undefined
  if (!konu) {
    const b = new Uint8Array(10)
    crypto.getRandomValues(b)
    konu = `claude-${[...b].map(x => x.toString(16).padStart(2, '0')).join('')}`
    await $.store.set('telefon.konu', konu)
  }
  return konu
}

export async function telefonGonder($: $T, baslik: string, metin: string): Promise<boolean> {
  if (!(await acik($, 'telefon'))) return false
  try {
    const r = await $.http.fetch(SUNUCU, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: await konuAl($), title: baslik, message: metin, tags: ['robot'] }),
    })
    return r.status < 300
  } catch {
    return false
  }
}

export const telefonKomutu = {
  name: 'telefon',
  description: 'Telefona bildirim (ntfy): "/telefon" kurar ve test gönderir, "/telefon kapat" durdurur',
}

export async function telefonKomut($: $T, args: string): Promise<string> {
  if (/kapat/i.test(args)) {
    await parcaAyarla($, 'telefon', false)
    return 'Telefona bildirim kapatıldı.'
  }
  const konu = await konuAl($)
  await parcaAyarla($, 'telefon', true)
  const gitti = await telefonGonder($, 'Claude bağlandı', 'Bundan sonra Claude bitince ya da seni beklerken buraya bildirim gelecek.')
  return [
    'Telefona bildirim açıldı. Kurulum:',
    '1. Telefona ntfy uygulamasını kur (App Store / Google Play, ücretsiz).',
    `2. Uygulamada "+" → konu adı: ${konu}`,
    `3. ${gitti ? 'Test bildirimi gönderildi; telefona düştüyse tamam.' : 'Test bildirimi gönderilemedi (internet?). /telefon ile tekrar dene.'}`,
    '',
    'Bildirime cevabın içeriği konmaz, yalnız "Claude bitti" / "seni bekliyor" ve proje adı gider. Konu adını kimseyle paylaşma.',
  ].join('\n')
}
