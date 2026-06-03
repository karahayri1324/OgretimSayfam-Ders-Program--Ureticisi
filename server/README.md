# api4 köprü servisi — ÖğretimSayfam

`api4.ogretimsayfam.com` üzerinde çalışan **köprü (bridge)** servisidir. Electron
uygulaması ile **kullanıcının PC'sinde çalışan vLLM modeli** arasında durur ve
şunları yapar:

- **Auth** — kayıt / giriş (JWT). Kullanıcı uygulamada hesap açınca burada kaydedilir.
- **Demo / abonelik kapısı** — istediğiniz an bir kullanıcıyı engelleyip AI erişimini kesersiniz.
- **Kota (rate limit)** — kullanıcı başına saatlik istek sınırı (varsayılan 100).
- **Inference-contract** — uygulamadan gelen payload'ı modelin eğitildiği mesaj
  formatına çevirip upstream vLLM'e iletir (`INFERENCE_CONTRACT.md` ile birebir).

> Model **burada çalışmaz**. VPS yalnızca köprüdür: kimliği doğrular, kotayı/kapıyı
> uygular, sonra isteği kullanıcının PC'sindeki vLLM'e yollar.

## Akış

```
┌────────────────┐   HTTPS + Bearer    ┌──────────────────────┐   tünel    ┌────────────────────┐
│ Electron uygu. │ ──────────────────► │  api4 köprü (VPS)    │ ─────────► │ vLLM (sizin PC'niz)│
│ (kullanıcı)    │ ◄────────────────── │  auth·kota·kapı·proxy│ ◄───────── │ fine-tuned model   │
└────────────────┘    model JSON       └──────────────────────┘            └────────────────────┘
```

İstek doğrudan VPS'e gelir; VPS modeli sizin PC'nizde sorgular; sonuç uygulamaya
döner ve ders programı kullanıcının PC'sinde değiştirilir.

---

## 1. Hızlı başlangıç (yerel/test)

```bash
cd server
cp .env.example .env          # düzenleyin (en azından JWT_SECRET ve ADMIN_*)
./run.sh                      # venv kurar + uvicorn başlatır (PORT=9000)
# veya:
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 9000
```

Sağlık kontrolü: `curl http://localhost:9000/health`

Testler:
```bash
pip install -r requirements-dev.txt
pytest -q
```

## 2. Docker ile

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```
DB ve WAL dosyaları `api4-data` adlı Docker named volume'unda kalıcıdır (konteyner
root olmayan `uid 10001` ile çalışır; named volume sahipliği Docker yönetir). API
yalnızca `127.0.0.1:9000`'e yayınlanır — dışarı TLS ters proxy üzerinden açılır.

---

## 3. Üretim deploy (VPS)

### 3.1. DNS + TLS
- `api4.ogretimsayfam.com` A kaydını VPS IP'sine yönlendirin (DNS'i siz kuracaksınız).
- Önünde TLS sonlandıran bir ters proxy kullanın. **Caddy** en kolayı:

```caddyfile
api4.ogretimsayfam.com {
    reverse_proxy 127.0.0.1:9000
}
```
(Caddy Let's Encrypt sertifikasını otomatik alır.) nginx + certbot da olur.

### 3.2. Servisi ayağa kaldırma
Docker (`docker compose up -d`) veya systemd:

```ini
# /etc/systemd/system/api4.service
[Unit]
Description=api4 kopru
After=network.target
[Service]
WorkingDirectory=/opt/api4/server
EnvironmentFile=/opt/api4/server/.env
ExecStart=/opt/api4/server/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 9000
Restart=always
[Install]
WantedBy=multi-user.target
```

### 3.3. Upstream bağlantısı (VPS → ev PC'sindeki vLLM)
Ev PC'si genelde NAT arkasındadır; VPS ona doğrudan HTTP atamaz. Bir **tünel** kurun
ve `UPSTREAM_VLLM_URL`'i ona göre ayarlayın. Üç seçenek:

1. **Cloudflare Tunnel** (önerilen, NAT-dostu, ücretsiz): PC'de `cloudflared tunnel`
   ile vLLM'i bir hostname'e bağlayın → `UPSTREAM_VLLM_URL=https://vllm.ogretimsayfam.com`.
2. **Reverse SSH tünel**: PC'den `ssh -N -R 8000:127.0.0.1:8000 vps` → VPS'te
   `UPSTREAM_VLLM_URL=http://127.0.0.1:8000` (autossh ile kalıcı yapın).
3. **Tailscale / WireGuard**: VPS ile PC aynı özel ağda; `UPSTREAM_VLLM_URL` = PC'nin
   tailscale IP'si.

### 3.4. vLLM (kullanıcının PC'sinde)
OpenAI-uyumlu sunucu; model fine-tune edilince:
```bash
vllm serve /path/to/merged-model \
  --served-model-name ogretimsayfam-scheduler \
  --port 8000 --api-key <gizli>   # api-key kullanırsanız UPSTREAM_API_KEY'e yazın
```
`UPSTREAM_MODEL` = `--served-model-name` ile aynı olmalı.

---

## 4. system_prompt.txt (DEPLOYMENT-KRİTİK)

Serving'in kullandığı system prompt, modelin **eğitildiği** ile **byte-eş** olmalı
(`INFERENCE_CONTRACT.md`). Bu klasördeki `system_prompt.txt` repodaki
`Plans/dataset_samples/system_prompt.txt`'in kopyasıdır. Prompt değişirse:

```bash
./sync_system_prompt.sh   # repodan tazeler
# sonra: modeli YENİDEN EĞİTİN
```
`pytest tests/test_inference_build.py` bu byte-eşliği doğrular.

---

## 5. Yönetim (admin)

### 5.1. Bootstrap admin
`.env` içinde `ADMIN_EMAIL` + `ADMIN_PASSWORD` verirseniz ilk açılışta admin oluşur.

### 5.2. CLI (VPS'te, doğrudan DB)
```bash
python admin_cli.py list                          # kullanıcılar + kota/durum
python admin_cli.py block ahmet@okul.com          # demo bitir → AI'a erişemez
python admin_cli.py block ahmet@okul.com --message "Size özel uyarı..."
python admin_cli.py unblock ahmet@okul.com
python admin_cli.py set-limit ahmet@okul.com 250  # kullanıcıya özel saatlik kota
python admin_cli.py set-expiry ahmet@okul.com 2026-07-01T00:00:00Z
python admin_cli.py reset-usage ahmet@okul.com
python admin_cli.py settings                       # global ayarlar
python admin_cli.py set-default-limit 100
python admin_cli.py set-default-message "Demo limitiniz dolmuştur ..."
```

### 5.3. Web paneli
`https://api4.ogretimsayfam.com/admin` — admin hesabıyla giriş yapın; kullanıcıları
listeleyin, engelleyin/açın, özel mesaj/kota atayın, global ayarları düzenleyin.

---

## 6. Demo / kota mantığı

- **Engel (demo bitti):** `status='blocked'` ya da `demo_expires_at` geçmişte ise,
  kullanıcı AI'a yazınca **HTTP 403** + mesaj döner. Mesaj önceliği:
  **kullanıcıya özel mesaj → global varsayılan → kod varsayılanı**
  (*"Demo limitiniz dolmuştur lütfen timetables.ogretimsayfam.com adresinden
  aboneliğinizi yenileyiniz."*). Hepsi backend'den, istediğiniz an değişir.
- **Kota:** kullanıcı başına saatlik istek sınırı (varsayılan 100, kullanıcıya özel
  override edilebilir, `0` = sınırsız). Aşılırsa **HTTP 429** + mesaj. **Her** `/respond`
  isteği sayılır (`toolHistory` client-kontrollü olduğu için "yalnızca ilk tur" mantığı
  sahte toolHistory ile bypass edilebilirdi). Tek bir kullanıcı mesajı, tool döngüsü
  nedeniyle 1–3 istek harcayabilir (MAX_TOOL_ITERATIONS=3); limiti buna göre ayarlayın.
- **Giriş koruması:** `/login` e-posta başına 15 dk içinde 8 başarısız denemeden sonra
  geçici olarak kilitlenir (brute-force'a karşı).

---

## 7. HTTP API özeti

| Yöntem | Yol | Auth | Açıklama |
|---|---|---|---|
| POST | `/v1/auth/register` | — | kayıt → `{token, user}` |
| POST | `/v1/auth/login` | — | giriş → `{token, user}` |
| GET  | `/v1/auth/me` | Bearer | oturum bilgisi |
| POST | `/v1/ai/respond` | Bearer | AI çıkarımı (kapı+kota+proxy) |
| GET  | `/v1/admin/users` | Bearer (admin) | kullanıcı listesi |
| GET/PATCH | `/v1/admin/users/{id}` | admin | görüntüle / güncelle |
| POST | `/v1/admin/users/{id}/block` · `/unblock` · `/reset-usage` | admin | |
| GET/PATCH | `/v1/admin/settings` | admin | global kota/mesaj |
| GET  | `/health` · `/health/upstream` | — | sağlık |

Hata gövdeleri her zaman `{"error": "...", "message": "..."}` biçimindedir.
