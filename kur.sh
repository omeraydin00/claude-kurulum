#!/usr/bin/env bash
# Claude Code kurulumunu yeni (ya da sıfırlanmış) bir bilgisayarda tek komutla geri getirir.
# Tekrar çalıştırmak güvenli: kurulu olanı yeniden kurar, ayarları yedek alıp birleştirir.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
# Kendi özel modların (ayrı, private repo) bu reponun yanına klonlandıysa onlar da yüklenir:
#   ../claude-*/mods/<ad>  (ör. ../claude-is/mods/is)
EK_MODLAR="$(for d in "$REPO"/../claude-*/mods/*/; do [ -d "$d" ] && (cd "$d" && pwd); done | grep -v "^$REPO/" | paste -sd: - || true)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

adim() { printf '\n▸ %s\n' "$1"; }

command -v claude >/dev/null || { echo "Önce Claude Code'u kur: https://code.claude.com"; exit 1; }
command -v python3 >/dev/null || { echo "python3 gerekli"; exit 1; }

adim "Eklenti pazarları"
claude plugin marketplace add jarrodwatts/claude-hud || true
claude plugin marketplace add kenryu42/cc-marketplace || true

adim "Eklentiler"
for e in claude-hud@claude-hud code-review@claude-plugins-official cc-safety-net@cc-marketplace; do
  claude plugin install "$e" || echo "  ! $e kurulamadı"
done

adim "Bildirim aracı (macOS)"
if command -v brew >/dev/null && ! command -v terminal-notifier >/dev/null; then
  brew install terminal-notifier || echo "  ! terminal-notifier kurulamadı; bildirimler osascript ile denenir"
fi
command -v terminal-notifier >/dev/null && echo "  Sistem Ayarları → Bildirimler → terminal-notifier: \"Bildirimlere izin ver\" açık olsun"

adim "claude-hud durum satırı"
CALISTIRICI="$(command -v bun || command -v node || true)"
HUD_KOMUTU=""
if [ -n "$CALISTIRICI" ]; then
  if [[ "$CALISTIRICI" == *bun ]]; then KAYNAK='src/index.ts'; EK='--env-file /dev/null '; else KAYNAK='dist/index.js'; EK=''; fi
  # claude-hud'un kendi /claude-hud:setup komutunun ürettiği komut: en yeni sürümü kendisi bulur.
  HUD_KOMUTU="bash -c 'cols=\${COLUMNS:-}; case \"\$cols\" in \"\"|*[!0-9]*) cols=\$(stty size 2>/dev/null </dev/tty | awk '\"'\"'{print \$2}'\"'\"');; esac; case \"\$cols\" in \"\"|*[!0-9]*) cols=120;; esac; export COLUMNS=\$(( cols > 4 ? cols - 4 : 1 )); plugin_dir=\$(ls -d \"\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}\"/plugins/cache/*/claude-hud/*/ 2>/dev/null | awk -F/ '\"'\"'{ print \$(NF-1) \"\\t\" \$(0) }'\"'\"' | grep -E '\"'\"'^[0-9]+\\.[0-9]+\\.[0-9]+[[:space:]]'\"'\"' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-); exec \"$CALISTIRICI\" ${EK}\"\${plugin_dir}$KAYNAK\"'"
  mkdir -p "$CLAUDE_DIR/plugins/claude-hud"
  cp "$REPO/ayarlar/claude-hud-config.json" "$CLAUDE_DIR/plugins/claude-hud/config.json"
else
  echo "  ! bun ya da node bulunamadı; durum satırı atlandı (sonra /claude-hud:setup)"
fi

adim "Ayarlar (modlar, Türkçe yükleniyor yazıları, durum satırı)"
python3 "$REPO/ayarlar/birlestir.py" "$REPO" "$HUD_KOMUTU" "$EK_MODLAR"

adim "Modların denetimi"
for d in "$REPO/mods/genel" $(printf '%s' "$EK_MODLAR" | tr ':' ' '); do
  claude plugin validate "$d" >/dev/null && echo "  ✓ $(basename "$d")" || echo "  ! $(basename "$d") doğrulanamadı: claude plugin validate $d"
done

cat <<SON

Bitti. Yeni bir terminalde 'claude' aç; modlar, eklentiler ve durum satırı gelir.
Ayrıntılar: $REPO/README.md
SON
