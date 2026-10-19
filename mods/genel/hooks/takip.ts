import { atom, read, update } from 'claude-code'

import type { TakipKaydi } from '../types'
import { acik } from './ayar'
import type { $T } from './ortak'

export const takip = atom({ plugin: 'genel', key: 'takip' } as const, [])

export async function takipAl($: $T): Promise<TakipKaydi[]> {
  return read($, takip)
}

export const TAKIP_EKLE = 'takip_ekle'
export const TAKIP_KAPAT = 'takip_kapat'

const TUR_AD = { cihaz: 'cihazda denenmedi', script: 'deploy sonrası script' } as const

async function kaydet($: $T, liste: TakipKaydi[]) {
  await update($, takip, () => liste)
  await $.store.set('takip', liste)
}

export async function takipYukle($: $T) {
  const kayitli = (await $.store.get('takip')) as TakipKaydi[] | undefined
  if (kayitli) await update($, takip, () => kayitli)
}

export async function takipAraclari($: $T) {
  await $.tool.register({
    name: TAKIP_EKLE,
    description:
      'Kalıcı takip listesine bir madde ekler (oturumlar arası saklanır, /takip ve /is panelinde görünür). ' +
      'tur "cihaz": yaptığın bir değişiklik gerçek cihazda/tablette/kartta denenmeden kaldıysa. ' +
      'tur "script": deploy sonrası sunucuda çalıştırılması gereken bir script ya da elle adım varsa (komutu metne yaz). ' +
      'Kullanıcı denediğini söyleyince ya da script çalışınca takip_kapat ile kapat.',
    inputSchema: {
      type: 'object',
      properties: {
        tur: { type: 'string', enum: ['cihaz', 'script'] },
        repo: { type: 'string', description: 'Repo klasör adı, ör. web-sitesi' },
        metin: { type: 'string', description: 'Kısa Türkçe açıklama; issue/PR numarasıyla' },
      },
      required: ['tur', 'repo', 'metin'],
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: TAKIP_KAPAT,
    description: 'Takip listesindeki bir maddeyi kapatır (cihazda denendi ya da script çalıştırıldı). id /takip listesindeki numaradır.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    isDeferred: false,
  })
}

export async function takipEkle($: $T, girdi: { tur?: unknown; repo?: unknown; metin?: unknown }): Promise<string> {
  if (!(await acik($, 'takip'))) return 'Takip parçası kapalı (/genel ac takip).'
  const tur = girdi.tur === 'script' ? 'script' : 'cihaz'
  const metin = String(girdi.metin ?? '').trim()
  if (!metin) return 'metin boş'
  const liste = await read($, takip)
  const id = Math.max(0, ...liste.map(k => k.id)) + 1
  await kaydet($, [...liste, { id, tur, repo: String(girdi.repo ?? ''), metin, eklendi: await $.clock.now() }])
  return `Takibe eklendi (#${id}, ${TUR_AD[tur]}).`
}

export async function takipKapat($: $T, id: number): Promise<string> {
  const liste = await read($, takip)
  const k = liste.find(x => x.id === id)
  if (!k) return `#${id} listede yok.`
  await kaydet($, liste.filter(x => x.id !== id))
  return `#${id} kapatıldı: ${k.metin}`
}

export function takipSatiri(k: TakipKaydi): string {
  return `#${k.id} ${k.tur === 'cihaz' ? '📱' : '📜'} ${k.repo}: ${k.metin}`
}

export const takipKomutu = {
  name: 'takip',
  description: 'Cihazda denenmedi / deploy sonrası script listesi; "/takip tamam 3" kapatır',
}

export async function takipKomut($: $T, args: string): Promise<string> {
  const [eylem = '', no = ''] = args.trim().split(/\s+/)
  if (['tamam', 'kapat', 'sil', 'denendi'].includes(eylem.toLocaleLowerCase('tr'))) return takipKapat($, Number(no.replace('#', '')))
  const liste = await read($, takip)
  if (liste.length === 0) return 'Takipte bir şey yok.'
  const grup = (tur: TakipKaydi['tur']) => liste.filter(k => k.tur === tur).map(takipSatiri)
  return [
    `📱 Cihazda denenmedi (${grup('cihaz').length})`, ...grup('cihaz'),
    `📜 Deploy sonrası (${grup('script').length})`, ...grup('script'),
    '\nKapatmak için: /takip tamam <no>',
  ].join('\n')
}

// PR açılırken o repoda bekleyen madde varsa açıklamaya yazılsın.
export async function takipPrNotu($: $T, repo: string | undefined): Promise<string | null> {
  if (!repo || !(await acik($, 'takip'))) return null
  const bekleyen = (await read($, takip)).filter(k => k.repo === repo)
  if (bekleyen.length === 0) return null
  return `[genel/takip] ${repo} için takipte ${bekleyen.length} madde var; PR açıklamasına "Cihazda denenmedi" / "Deploy sonrası" başlığıyla ekle (gh pr edit):\n${bekleyen.map(takipSatiri).join('\n')}`
}
