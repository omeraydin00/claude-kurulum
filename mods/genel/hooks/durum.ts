import type { $T } from './ortak'

// Durum satırı tek (eklenti başına bir tane): parçalar yan yana.
type Anahtar = 'test' | 'tablet' | 'ortam' | 'ci'
const SIRA: Anahtar[] = ['test', 'tablet', 'ortam', 'ci']
const parcalar: Partial<Record<Anahtar, string>> = {}

export function durumYaz($: $T, anahtar: Anahtar, metin: string | undefined) {
  if (parcalar[anahtar] === metin) return
  parcalar[anahtar] = metin
  const satir = SIRA.map(a => parcalar[a]).filter(Boolean).join('  ·  ')
  $.ui.status(satir || undefined)
}

// Claude'a bir sonraki fırsatta (prompt ya da araç sonucu) iletilecek notlar.
const bekleyen: string[] = []

export function notEkle(metin: string) {
  bekleyen.push(metin)
}

export function notlariAl(): string[] {
  return bekleyen.splice(0)
}
