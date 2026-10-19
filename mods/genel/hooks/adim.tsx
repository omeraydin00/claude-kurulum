import { atom, read, update } from 'claude-code'
import type { RenderInput } from 'claude-code'

import { acik } from './ayar'
import type { $T } from './ortak'

export const adim = atom({ plugin: 'genel', key: 'adim' } as const, null)

export const ADIM_SOR = 'adim_sor'
const VARSAYILAN_SECENEK = ['Yaptım', 'Olmadı']

export async function adimAraci($: $T) {
  await $.tool.register({
    name: ADIM_SOR,
    description:
      'Kullanıcıdan fiziksel bir adım istediğinde kullan (kabloyu tak, butona bas, tableti yeniden başlat, fincanı koy). ' +
      'Prompt’un üstünde tek tıklık cevap düğmeleri gösterir; kullanıcı basınca cevap sana yeni mesaj olarak gelir. ' +
      'Çağırdıktan sonra turu bitir ve bekle. secenekler verilmezse "Yaptım" ve "Olmadı" çıkar.',
    inputSchema: {
      type: 'object',
      properties: {
        soru: { type: 'string', description: 'Kısa Türkçe talimat, ör. "Kartın USB kablosunu tak"' },
        secenekler: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'ör. ["Taktım", "Işık yanmıyor", "Olmadı"]' },
      },
      required: ['soru'],
    },
    isDeferred: false,
  })
}

export async function adimSor($: $T, girdi: { soru?: unknown; secenekler?: unknown }): Promise<string> {
  if (!(await acik($, 'adim'))) return 'Düğmeler kapalı (/genel ac adim); kullanıcıya düz metinle sor.'
  const secenekler = Array.isArray(girdi.secenekler) ? girdi.secenekler.map(String).filter(Boolean).slice(0, 4) : []
  await update($, adim, () => ({ soru: String(girdi.soru ?? ''), secenekler: secenekler.length ? secenekler : VARSAYILAN_SECENEK }))
  return 'Düğmeler gösterildi. Turu burada bitir; kullanıcının cevabı yeni mesaj olarak gelecek.'
}

// Kullanıcı kendi yazarak cevap verirse düğmeler kalkar.
export async function adimTemizle($: $T) {
  if (await read($, adim)) await update($, adim, () => null)
}

async function cevapla($: $T, metin: string) {
  await update($, adim, () => null)
  await $.prompt.submit({ text: metin, asUser: true })
}

export async function adimBant($: $T, e: RenderInput<'AbovePrompt'>) {
  const a = await read($, adim)
  if (!a) return null
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Text color="suggestion" wrap="truncate-end">🔧 {a.soru}</Text>
      <Box>
        {a.secenekler.map((s, i) => (
          <Box key={`adim-${i}`}>
            <Button key={`adim-b-${i}`} label={s} onPress={() => cevapla($, s)} />
            <Text> </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
