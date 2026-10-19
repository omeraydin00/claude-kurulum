#!/usr/bin/env python3
"""settings-ekleri.json'ı ~/.claude/settings.json'a ekler; mevcut ayarlara dokunmaz, önce yedek alır.

Kullanım: birlestir.py <repo> <statusLine komutu ya da ""> [ek mod klasörleri, ":" ile]
"""
import json, os, shutil, sys, time

repo, hud_komutu = sys.argv[1], sys.argv[2]
ek_modlar = sys.argv[3] if len(sys.argv) > 3 else ''
hedef = os.path.join(os.environ.get('CLAUDE_CONFIG_DIR') or os.path.expanduser('~/.claude'), 'settings.json')
ek = json.load(open(os.path.join(repo, 'ayarlar', 'settings-ekleri.json')))

metin = json.dumps(ek, ensure_ascii=False).replace('{REPO}', repo)
ek = json.loads(metin)
if hud_komutu:
    ek['statusLine']['command'] = hud_komutu
else:
    ek.pop('statusLine')

ayar = {}
if os.path.exists(hedef):
    yedek = f'{hedef}.bak.{time.strftime("%Y%m%d-%H%M%S")}'
    shutil.copy(hedef, yedek)
    print(f'  yedek: {yedek}')
    ayar = json.load(open(hedef))

env = ek.pop('env')
if ek_modlar:
    env['CLAUDE_CODE_PLUGIN_DIRS'] += ':' + ek_modlar
ayar.setdefault('env', {}).update(env)
ayar.update(ek)
os.makedirs(os.path.dirname(hedef), exist_ok=True)
with open(hedef, 'w') as f:
    json.dump(ayar, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'  yazıldı: {hedef}')
