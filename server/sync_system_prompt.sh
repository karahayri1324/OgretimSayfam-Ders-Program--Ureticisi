#!/usr/bin/env bash
# system_prompt.txt'yi ana repodaki kaynaktan kopyalar (byte-eş tutmak için).
# Dataset/system prompt değiştiğinde çalıştırın; sonra modeli yeniden eğitin.
set -euo pipefail
cd "$(dirname "$0")"
SRC="../Plans/dataset_samples/system_prompt.txt"
if [ ! -f "$SRC" ]; then
  echo "Kaynak bulunamadı: $SRC" >&2
  exit 1
fi
cp "$SRC" system_prompt.txt
echo "system_prompt.txt güncellendi ($(wc -c < system_prompt.txt) byte)."
echo "UYARI: prompt değiştiyse modeli YENİDEN EĞİTİN (INFERENCE_CONTRACT.md §5)."
