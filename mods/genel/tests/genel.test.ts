import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { talimatEkle } from '../hooks/devir'
import { anahtarlar } from '../hooks/env'
import { hataImzasi, sonrakiAciklama } from '../hooks/hata'
import { kayittanCikar } from '../hooks/kaldik'
import { komutKlasoru, projeKlasoru } from '../hooks/ortak'
import { ortamSatiri } from '../hooks/ortam'
import { portBul } from '../hooks/port'
import { baglantiCoz } from '../hooks/tablet'
import { kartMetni } from '../hooks/kart'
import { sonSatirlar } from '../hooks/test'

type Kural = [RegExp, string | (() => string), (number | (() => number))?]

let saat: ReturnType<typeof mock.clock>

// Eklentinin altındaki dünya: dosyalar, klasörler ve komut çıktıları bellekte.
type Dunya = {
  cwd: string; dosyalar: Record<string, string>; klasorler: Record<string, string[]>; komutlar: Kural[]
  stdout?: string; hata?: boolean; bildirim?: string[]; gonderilen?: string[]; cevap?: string; metro?: number[]
  duzenle?: (yol: string) => void
  giden?: string[]
}

function dunya(on: On, opt: Dunya) {
  const calisan: string[] = []
  saat = mock.clock(on, { now: 1_000_000 })
  on('session.cwd', () => ({ value: opt.cwd }))
  on('session.id', () => ({ value: 'oturum' }))
  on('session.turns', () => ({ value: 0 }))
  on('env.get', () => ({ value: '/ev' }))
  on('fs.exists', ($, e) => ({ value: e.path in opt.dosyalar || e.path in opt.klasorler }))
  on('fs.list', ($, e) => ({ value: (opt.klasorler[e.path] ?? []).map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }))
  on('fs.read', ($, e) => {
    const metin = opt.dosyalar[e.path]
    if (metin === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: metin }
  })
  on('fs.write', ($, e) => {
    opt.dosyalar[e.path] = e.text
    return { value: undefined }
  })
  on('http.fetch', ($, e) => {
    if (opt.giden && e.url.startsWith('https://')) {
      opt.giden.push(`${e.url} ${e.init?.body ?? ''}`)
      return { value: { status: 200, text: '{}' } } as never
    }
    const port = Number(e.url.match(/:(\d+)\//)?.[1])
    if (!opt.metro?.includes(port)) throw new Error('ECONNREFUSED')
    return { value: { status: 200, text: 'packager-status:running' } } as never
  })
  on('process.run', ($, e) => {
    const satir = e.argv.join(' ')
    calisan.push(satir)
    const kural = opt.komutlar.find(([re]) => re.test(`${satir} @${e.init?.cwd ?? ''}`))
    return { value: { exitCode: kural ? (typeof kural[2] === 'function' ? kural[2]() : (kural[2] ?? 0)) : 1, stdout: typeof kural?.[1] === 'function' ? kural[1]() : (kural?.[1] ?? ''), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    opt.bildirim?.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', ($, e) => {
    opt.bildirim?.push(`bildirim: ${e.text}`)
    return { value: { isSent: true as const, channel: 'terminal_bell' as const } }
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', ($, e) => ({ value: { tool: `mcp__genel__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, tokens: 50_000, percent: 25 }, rateLimits: [] } }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', ($, e) => {
    opt.gonderilen?.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      const soru = e.questions[0]?.question ?? ''
      return { result: { questions: e.questions, answers: { [soru]: opt.cevap ?? 'Vazgeç' } } }
    }
    if ('file_path' in e && typeof e.file_path === 'string') opt.duzenle?.(e.file_path)
    const stdout = opt.stdout ?? 'ok'
    return opt.hata
      ? { result: { stdout, stderr: '', interrupted: false }, text: stdout, isError: true } as never
      : { result: { stdout, stderr: '', interrupted: false } }
  })
  return calisan
}

describe('yardımcılar', () => {
  test('bağlantı satırı ve komut klasörü', () => {
    expect(baglantiCoz('10.0.0.12:36409 KOD 904677 bağlan')).toEqual({ ip: '10.0.0.12', port: '36409', kod: '904677', geriKalan: '' })
    expect(baglantiCoz('sunucu 10.0.0.1:5003 cevap vermiyor')).toBeNull()
    expect(komutKlasoru('cd /k/A && cd ../B && gh pr create', '/x')).toBe('/k/B')
    expect(projeKlasoru('/Users/ben', '/Users/ben/projeler/çalışma')).toBe('/Users/ben/.claude/projects/-Users-ben-projeler--al--ma')
  })

  test('hata imzası değişen kısımları atar', () => {
    expect(hataImzasi('> node app\nError: listen EADDRINUSE: address already in use :::8081\n    at Server.setupListenHandle')).toBe('Error: listen EADDRINUSE: address already in use')
    expect(hataImzasi("npm ERR! Cannot find module '/Users/ben/x/node_modules/expo/bin/cli'")).toBe('npm ERR! Cannot find module')
    expect(hataImzasi('her şey yolunda')).toBeNull()
  })

  test('eski kayıttan hatanın ardından gelen açıklama okunur', () => {
    const satirlar = [
      JSON.stringify({ type: 'user', timestamp: '2026-10-03T08:00:00Z', message: { content: [{ type: 'tool_result', content: 'EADDRINUSE' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Port 8081’i başka projenin Metro’su tutuyor; bunu 8082’de başlatıyorum.' }] } }),
    ]
    expect(sonrakiAciklama(satirlar)).toEqual({ zaman: '2026-10-03T08:00:00Z', metin: 'Port 8081’i başka projenin Metro’su tutuyor; bunu 8082’de başlatıyorum.' })
  })

  test('nerede kaldık: son istekler ve son cevap', () => {
    const r = kayittanCikar([
      JSON.stringify({ type: 'user', timestamp: '2026-10-19T10:00:00Z', message: { content: 'köpükleri arttır' } }),
      JSON.stringify({ type: 'user', message: { content: '<command-name>/login</command-name>' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-10-19T10:05:00Z', message: { content: [{ type: 'text', text: 'Köpük arttı, tablette denemedik.' }] } }),
    ])
    expect(r).toEqual({ zaman: Date.parse('2026-10-19T10:05:00Z'), isteklerim: ['köpükleri arttır'], sonCevap: 'Köpük arttı, tablette denemedik.' })
  })

  test('port çakışması tanınır', () => {
    expect(portBul('Error: listen EADDRINUSE: address already in use :::8081')).toBe(8081)
    expect(portBul('Port 3000 is already in use')).toBe(3000)
    expect(portBul('Something is already running on port 8082.')).toBe(8082)
    expect(portBul('build ok')).toBeNull()
  })

  test('.env anahtarları ve ortam satırı', () => {
    expect([...anahtarlar('# yorum\nAPI_URL=x\nexport SECRET = y\n bos\n')]).toEqual(['API_URL', 'SECRET'])
    expect(ortamSatiri({ ip: '10.0.0.5', sunucu: 5003, metro: [8082], onYuz: [5173], tabletVar: false })).toBe('🖥 sunucu :5003 · Metro :8082 · web :5173 · API 10.0.0.5:5003')
    expect(ortamSatiri({ ip: '10.0.0.2', sunucu: null, metro: [], onYuz: [], tabletVar: false })).toBeUndefined()
  })

  test('sıkıştırma talimatı mevcut talimatın arkasına eklenir', () => {
    expect(talimatEkle('planı koru')).toMatch(/^planı koru\n\n\[genel\/devir\].*Devir/)
  })
})

// Tur sonunda arkada koşan işi (testler) bekler.
async function bekleKadar(kosul: () => boolean) {
  const bekle = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout
  for (let i = 0; i < 100 && !kosul(); i++) await new Promise<void>(r => bekle(r, 5))
}

const repo = (dir: string, slug: string): Kural[] => [
  [new RegExp(`^git rev-parse --show-toplevel @${dir}`), dir],
  [new RegExp(`^git remote @${dir}`), 'origin'],
  [new RegExp(`^git remote get-url origin @${dir}`), `git@github.com:${slug}.git`],
]

describe('kancalar', () => {
  test('tablet: açık Metro’ya yönlendirir', async ($, on) => {
    mock.store(on)
    const calisan = dunya(on, {
      cwd: '/p', dosyalar: {}, klasorler: {}, metro: [8082],
      komutlar: [
        [/^adb pair/, 'Successfully paired to 10.0.0.12:36409'],
        [/^adb mdns services/, 'adb-ABC1\t_adb-tls-connect._tcp\t10.0.0.12:45045'],
        [/^adb connect/, 'connected to 10.0.0.12:45045'],
        [/getprop ro.product.model/, 'Tablet_X'],
        [/pm list packages/, 'package:com.ornek.app'],
        [/^lsof .*5003/, 'node 123 ben'],
        [/^adb .*reverse/, ''],
      ],
    })
    const r = await $.prompt.submit({ text: '10.0.0.12:36409 KOD 904677 bağlan' } as never)
    expect(r.drop).toContain('Tablet_X 10.0.0.12:45045')
    expect(calisan).toContain('adb -s 10.0.0.12:45045 reverse tcp:8081 tcp:8082')
    expect(calisan).toContain('adb -s 10.0.0.12:45045 reverse tcp:5003 tcp:5003')
  })

  test('herhangi bir repoda PR açılınca CI izlenir ve kırmızı sonuç bildirilir', async ($, on) => {
    mock.store(on)
    const bildirim: string[] = []
    let kontroller = '[{"name":"test","bucket":"pending"}]'
    dunya(on, {
      cwd: '/p/site', dosyalar: {}, klasorler: {}, bildirim, stdout: 'https://github.com/ornek/site/pull/7\n',
      komutlar: [...repo('/p/site', 'ornek/site'), [/^gh pr checks 7/, () => kontroller], [/^gh /, '[]']],
    })
    await $.session.start({ cwd: '/p/site', surface: null, isInteractive: false })
    await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y' })
    kontroller = '[{"name":"test","bucket":"fail"}]'
    await saat.advance(60_000)
    expect(bildirim.some(b => b.includes('site PR #7: CI kırmızı (test)'))).toBe(true)
    const p = await $.prompt.submit({ text: 'devam' } as never)
    expect(p.context?.join('\n')).toContain('[genel/ci]')
  })

  test('port çakışmasında programı gösterir, kapat düğmesi süreci kapatır', async ($, on) => {
    mock.store(on)
    const calisan = dunya(on, {
      cwd: '/p', dosyalar: {}, klasorler: {}, hata: true, stdout: 'Error: listen EADDRINUSE: address already in use :::8081',
      komutlar: [[/^lsof -nP -iTCP:8081/, 'p4242\ncnode'], [/^lsof -a -p 4242/, 'p4242\nfcwd\nn/p/mobil'], [/^kill 4242/, ''], [/^find /, '']],
    })
    on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, '') as never)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const r = await $.tool.call({ tool: 'Bash', command: 'npx expo start' })
    expect(r.context?.join('\n')).toContain("Port 8081'i node (pid 4242, klasör /p/mobil) tutuyor")
    const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
    const bant = await $.ui.mount({ plugin: 'genel', surface: 'desktop', component: 'AbovePrompt', props })
    await bant.drawn()
    expect(await bant.find({ text: /Port 8081: node/ })).toBeDefined()
    await bant.press({ key: 'port-kapat' })
    expect(calisan).toContain('kill 4242')
  })

  test('hata eski oturumda görüldüyse Claude’a o zamanki açıklama iletilir', async ($, on) => {
    mock.store(on)
    const eski = [
      JSON.stringify({ type: 'user', timestamp: '2026-10-03T08:00:00Z', message: { content: 'Error: listen EADDRINUSE: address already in use :::8081' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Port 8081’i başka projenin Metro’su tutuyor; 8082’de başlatıyorum.' }] } }),
    ].join('\n')
    dunya(on, {
      cwd: '/p', dosyalar: { '/opt/homebrew/bin/rg': '' }, klasorler: {}, hata: true, stdout: 'Error: listen EADDRINUSE: address already in use :::8081',
      komutlar: [
        [/^\/opt\/homebrew\/bin\/rg -l -F/, '/ev/.claude/projects/-Users-ben-projeler-api/eski.jsonl'],
        [/^\/opt\/homebrew\/bin\/rg -n -m1/, '12:Error: listen'],
        [/^sed -n 12,72p/, eski],
      ],
    })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const r = await $.tool.call({ tool: 'Bash', command: 'npx expo start' })
    expect(r.context?.join('\n')).toContain('- projeler-api, 2026-10-03: "Port 8081’i başka projenin Metro’su tutuyor; 8082’de başlatıyorum."')
  })

  test('ripgrep yoksa arama komutu bekletmez; bulunan bir sonraki mesajla iletilir', async ($, on) => {
    mock.store(on)
    const eski = [
      JSON.stringify({ type: 'user', timestamp: '2026-10-03T08:00:00Z', message: { content: 'Error: Cannot find module x' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Paket kurulu değildi; npm install ile çözüldü, sonra tekrar denedim.' }] } }),
    ].join('\n')
    dunya(on, {
      cwd: '/p', dosyalar: {}, klasorler: {}, hata: true, stdout: "Error: Cannot find module 'x'",
      komutlar: [
        [/^find \/ev\/.claude\/projects/, '/ev/.claude/projects/-Users-ben-projeler-api/eski.jsonl'],
        [/^grep -n -m1 -o/, '12:Error: Cannot find module'],
        [/^sed -n 12,72p/, eski],
      ],
    })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const r = await $.tool.call({ tool: 'Bash', command: 'node a.js' })
    expect(r.context?.join('\n') ?? '').not.toContain('[genel/hata]')
    let p = await $.prompt.submit({ text: 'devam' } as never)
    for (let i = 0; i < 20 && !(p.context ?? []).join('').includes('[genel/hata]'); i++) {
      await bekleKadar(() => false)
      p = await $.prompt.submit({ text: 'devam' } as never)
    }
    expect(p.context?.join('\n')).toContain('npm install ile çözüldü')
  })

  test('main kırmızı bandı [tamam] ile kapanır, aynı liste sürdükçe geri gelmez', async ($, on) => {
    mock.store(on)
    dunya(on, { cwd: '/p/site', dosyalar: {}, klasorler: {}, komutlar: [...repo('/p/site', 'ornek/site'), [/^gh run list/, '[{"conclusion":"failure"}]'], [/^gh /, '[]']] })
    on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, '') as never)
    await $.session.start({ cwd: '/p/site', surface: null, isInteractive: false })
    const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
    let bant = await $.ui.mount({ plugin: 'genel', surface: 'desktop', component: 'AbovePrompt', props })
    await bant.drawn()
    for (let i = 0; i < 20 && !(await bant.find({ text: /main kırmızı: site/ })); i++) {
      await bant.unmount()
      await bekleKadar(() => false)
      bant = await $.ui.mount({ plugin: 'genel', surface: 'desktop', component: 'AbovePrompt', props })
      await bant.drawn()
    }
    expect(await bant.find({ text: /main kırmızı: site/ })).toBeDefined()
    await bant.press({ key: 'kirmizi-tamam' })
    await bant.unmount()
    const sonra = await $.ui.mount({ plugin: 'genel', surface: 'desktop', component: 'AbovePrompt', props })
    await sonra.drawn()
    expect(await sonra.find({ text: /main kırmızı/ })).toBeUndefined()
  })

  test('takip_ekle aracı listeye yazar, /takip tamam kapatır', async ($, on) => {
    mock.store(on)
    dunya(on, { cwd: '/p', dosyalar: {}, klasorler: {}, komutlar: [] })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const r = await $.tool.call({ tool: 'mcp__genel__takip_ekle', tur: 'cihaz', repo: 'site', metin: 'mobil menü telefonda denenmedi' })
    expect(r.result).toBe('Takibe eklendi (#1, cihazda denenmedi).')
    expect((await $.command.run({ command: 'takip', args: '' } as never)).text).toContain('#1 📱 site: mobil menü')
    expect((await $.command.run({ command: 'takip', args: 'tamam 1' } as never)).text).toContain('#1 kapatıldı')
  })

  test('adim_sor düğmesine basınca cevap kullanıcının mesajı olarak gider', async ($, on) => {
    mock.store(on)
    const gonderilen: string[] = []
    dunya(on, { cwd: '/p', dosyalar: {}, klasorler: {}, komutlar: [], gonderilen })
    on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, '') as never)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await $.tool.call({ tool: 'mcp__genel__adim_sor', soru: 'Kabloyu tak', secenekler: ['Taktım', 'Olmadı'] })
    for (const surface of ['terminal', 'desktop'] as const) {
      const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
      const bant = await $.ui.mount({ plugin: 'genel', surface, component: 'AbovePrompt', props })
      await bant.drawn()
      expect(await bant.find({ text: /Kabloyu tak/ })).toBeDefined()
      if (surface === 'desktop') {
        await bant.press({ key: 'adim-b-0' })
        expect(gonderilen).toContain('Taktım')
      }
      await bant.unmount()
    }
  })

  test('uzun tur bitince bildirim gelir, kısa turda gelmez', async ($, on) => {
    mock.store(on)
    const bildirim: string[] = []
    dunya(on, { cwd: '/p', dosyalar: {}, klasorler: {}, komutlar: [], bildirim })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await $.turn.complete({ answer: 'Kısa', durationMs: 5_000, isAborted: false, turnId: 'a', reason: 'answer' })
    await $.turn.complete({ answer: '## Build tamam\nAPK hazır.', durationMs: 180_000, isAborted: false, turnId: 'b', reason: 'answer' })
    expect(bildirim.filter(b => b.startsWith('bildirim:'))).toEqual(['bildirim: Build tamam'])
  })

  test('tur sonu kartı süre satırının yerine çizilir', async ($, on) => {
    mock.store(on)
    dunya(on, { cwd: '/p', dosyalar: { '/p/a.ts': 'x' }, klasorler: {}, komutlar: [] })
    on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'motor') as never)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await $.prompt.submit({ text: 'düzelt' } as never)
    await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a\nb', new_string: 'a\nb\nc', replace_all: false })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.turn.complete({ answer: 'tamam', durationMs: 134_000, isAborted: false, turnId: 't', reason: 'answer' })
    for (const surface of ['terminal', 'desktop'] as const) {
      const kart = await $.ui.mount({ plugin: 'genel', surface, component: 'TurnDuration', props: { word: 'Cooked', durationMs: 134_000 } } as never)
      await kart.drawn()
      expect(await kart.find({ text: /✓ 2 dk 14 sn · 1 dosya \(\+3 −2\) · 1 komut/ })).toBeDefined()
      await kart.unmount()
    }
  })

  test('düzenlenen dosya projenin prettier’ıyla formatlanır, Claude’a yeniden okuması söylenir', async ($, on) => {
    mock.store(on)
    const dosyalar: Record<string, string> = { '/p/site/package.json': '{"prettier":{}}', '/p/site/node_modules/.bin/prettier': '', '/p/site/src/a.ts': 'x' }
    const calisan = dunya(on, {
      cwd: '/p/site', dosyalar, klasorler: {},
      komutlar: [...repo('/p/site', 'ornek/site'), [/prettier --check/, ''], [/prettier --write/, () => { dosyalar['/p/site/src/a.ts'] = 'x;'; return '' }]],
    })
    await $.session.start({ cwd: '/p/site', surface: null, isInteractive: false })
    const r = await $.tool.call({ tool: 'Edit', file_path: '/p/site/src/a.ts', old_string: 'a', new_string: 'b', replace_all: false })
    expect(calisan.some(c => c.includes('prettier --write --log-level warn /p/site/src/a.ts'))).toBe(true)
    expect(r.context?.join('\n')).toContain('[genel/format] a.ts')
  })

  test('önceden formatsız dosya formatlanmaz: PR’a ilgisiz fark girmesin', async ($, on) => {
    mock.store(on)
    const dosyalar: Record<string, string> = { '/p/site/package.json': '{"prettier":{}}', '/p/site/node_modules/.bin/prettier': '', '/p/site/src/eski.js': 'x' }
    const calisan = dunya(on, {
      cwd: '/p/site', dosyalar, klasorler: {},
      komutlar: [...repo('/p/site', 'ornek/site'), [/prettier --check/, '', 1], [/prettier --write/, '']],
    })
    await $.session.start({ cwd: '/p/site', surface: null, isInteractive: false })
    const r = await $.tool.call({ tool: 'Edit', file_path: '/p/site/src/eski.js', old_string: 'a', new_string: 'b', replace_all: false })
    expect(calisan.some(c => c.includes('prettier --write'))).toBe(false)
    expect(r.context?.join('\n') ?? '').not.toContain('[genel/format]')
  })

  test('formatlayıcısı olmayan projede dokunulmaz', async ($, on) => {
    mock.store(on)
    const calisan = dunya(on, { cwd: '/p/x', dosyalar: { '/p/x/a.ts': 'x' }, klasorler: {}, komutlar: [...repo('/p/x', 'ornek/x')] })
    await $.session.start({ cwd: '/p/x', surface: null, isInteractive: false })
    await $.tool.call({ tool: 'Edit', file_path: '/p/x/a.ts', old_string: 'a', new_string: 'b', replace_all: false })
    expect(calisan.some(c => c.includes('prettier'))).toBe(false)
  })

  test('izin beklerken masaüstü bildirimi gider', async ($, on) => {
    mock.store(on)
    const calisan = dunya(on, { cwd: '/p', dosyalar: {}, klasorler: {}, komutlar: [[/^osascript/, '']] })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
    expect(calisan.some(c => c.startsWith('osascript') && c.includes('Claude needs your permission') && c.includes('Claude seni bekliyor'))).toBe(true)
  })
  test('kod değişen turun sonunda testler koşar; kırılırsa Claude’a geri gönderilir, en çok iki kez', async ($, on) => {
    mock.store(on)
    const gonderilen: string[] = []
    const bildirim: string[] = []
    const dosyalar: Record<string, string> = { '/p/site/package.json': '{"scripts":{"test":"vitest run"}}', '/p/site/src/a.ts': 'x' }
    let gecer = false
    dunya(on, {
      cwd: '/p/site', dosyalar, klasorler: {}, gonderilen, bildirim,
      komutlar: [...repo('/p/site', 'ornek/site'), [/^npm test --silent/, () => (gecer ? 'ok' : 'FAIL src/a.test.ts\nexpected 2, got 3'), () => (gecer ? 0 : 1)]],
    })
    await $.session.start({ cwd: '/p/site', surface: null, isInteractive: false })
    const tur = async () => {
      await $.tool.call({ tool: 'Edit', file_path: '/p/site/src/a.ts', old_string: 'a', new_string: 'b', replace_all: false })
      await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
    }
    const gonderildi = () => gonderilen.filter(g => g.startsWith('[genel/test]')).length
    await tur()
    await bekleKadar(() => gonderildi() === 1)
    expect(gonderilen.at(-1)).toContain('[genel/test] site içinde kod değişti ve testler kırıldı')
    expect(gonderilen.at(-1)).toContain('expected 2, got 3')
    await tur()
    await bekleKadar(() => gonderildi() === 2)
    await tur()
    await bekleKadar(() => bildirim.some(b => b.includes('otomatik düzeltme durdu')))
    expect(gonderildi()).toBe(2)
    expect(bildirim.some(b => b.includes('otomatik düzeltme durdu'))).toBe(true)
    gecer = true
    await tur()
    await bekleKadar(() => bildirim.some(b => b.includes('site: testler geçti')))
    expect(bildirim.some(b => b.includes('site: testler geçti'))).toBe(true)
  })

  test('test komutu olmayan projede test koşmaz; .md düzenlemesi test tetiklemez', async ($, on) => {
    mock.store(on)
    const calisan = dunya(on, { cwd: '/p/x', dosyalar: { '/p/x/package.json': '{"scripts":{"test":"echo \\"Error: no test specified\\""}}', '/p/x/a.ts': 'x', '/p/x/b.md': 'x' }, klasorler: {}, komutlar: [...repo('/p/x', 'ornek/x')] })
    await $.session.start({ cwd: '/p/x', surface: null, isInteractive: false })
    await $.tool.call({ tool: 'Edit', file_path: '/p/x/a.ts', old_string: 'a', new_string: 'b', replace_all: false })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
    expect(calisan.some(c => c.startsWith('npm'))).toBe(false)
  })

  test('/telefon ntfy konusu üretir, test bildirimi içerik göndermez', async ($, on) => {
    mock.store(on)
    const giden: string[] = []
    dunya(on, { cwd: '/p/site', dosyalar: {}, klasorler: {}, komutlar: [[/^osascript/, '']], giden })
    await $.session.start({ cwd: '/p/site', surface: null, isInteractive: false })
    const r = await $.command.run({ command: 'telefon', args: '' } as never)
    expect(r.text).toMatch(/konu adı: claude-[0-9a-f]{20}/)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
    const son = JSON.parse(giden.at(-1)!.replace('https://ntfy.sh ', ''))
    expect(son).toMatchObject({ title: 'Claude seni bekliyor', message: 'site' })
    expect(giden.at(-1)).not.toContain('permission to use Bash')
  })
})

describe('kart ve gösterge metinleri', () => {
  test('metinler', () => {
    expect(kartMetni(45_000, undefined)).toBe('✓ 45 sn')
    expect(kartMetni(3_725_000, { dosyalar: ['a', 'b'], arti: 10, eksi: 2, komut: 0, hata: 1 })).toBe('✓ 1 sa 2 dk · 2 dosya (+10 −2) · 1 hata')
    expect(sonSatirlar('a\nb\nc', 2)).toBe('b\nc')
  })
})
