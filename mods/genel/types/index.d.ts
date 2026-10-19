export type TabletDurum = {
  serial: string
  model: string
  metro: string
  sunucuPort: number | null
  bagli: boolean
}

export type Ayarlar = {
  kaldik: boolean
  hata: boolean
  bitti: boolean
  ses: boolean
  bekliyor: boolean
  kart: boolean
  format: boolean
  test: boolean
  telefon: boolean
  takip: boolean
  adim: boolean
  devir: boolean
  ci: boolean
  tablet: boolean
  ortam: boolean
  port: boolean
  env: boolean
}

export type CiIzleme = {
  slug: string
  repo: string
  no: number
  url: string
  basladi: number
  ozet: string | null
}

export type TakipKaydi = {
  id: number
  tur: 'cihaz' | 'script'
  repo: string
  metin: string
  eklendi: number
}

export type FizikselAdim = { soru: string; secenekler: string[] }

export type PortCakisma = { port: number; pid: number; program: string; klasor: string }

export type Kaldik = { zaman: number; ozet: string; isteklerim: string[]; repolar: string[] }

declare module 'claude-code' {
  interface PluginState {
    genel: {
      tablet: TabletDurum | null
      ayarlar: Ayarlar
      ci: CiIzleme[]
      mainKirmizi: string[]
      kirmiziGorulen: string
      takip: TakipKaydi[]
      adim: FizikselAdim | null
      port: PortCakisma | null
      kaldik: Kaldik | null
      kartlar: Record<string, { dosyalar: string[]; arti: number; eksi: number; komut: number; hata: number }>
    }
  }
}
