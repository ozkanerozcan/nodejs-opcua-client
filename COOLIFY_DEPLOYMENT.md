# Coolify Deployment Guide

Bu rehber, OPC UA Client API'yi Coolify platformunda Nixpacks ile nasıl deploy edeceğinizi gösterir.

## 📋 Ön Gereksinimler

- Coolify hesabı ve kurulu instance
- Git repository (GitHub, GitLab, veya Bitbucket)
- PLC'ye network erişimi olan sunucu

## 🚀 Deployment Adımları

### 1. Repository'yi Hazırlama

Proje zaten Coolify için hazırlanmış durumda. Gerekli dosyalar:
- ✅ `nixpacks.toml` - Nixpacks build konfigürasyonu
- ✅ `.dockerignore` - Build'e dahil edilmeyecek dosyalar
- ✅ `package.json` - Node.js version ve production script
- ✅ `.env.example` - Environment variables template

### 2. Coolify'da Yeni Proje Oluşturma

1. Coolify dashboard'a giriş yapın
2. **New Resource** → **Application** seçin
3. Repository'nizi seçin (GitHub/GitLab/Bitbucket)
4. Branch seçin (örn: `main` veya `master`)

### 3. Build Ayarları

Coolify otomatik olarak `nixpacks.toml` dosyasını tespit edecektir.

**Build Pack:** Nixpacks (otomatik tespit edilir)
**Base Directory:** `opcua-client` (eğer monorepo kullanıyorsanız)
**Build Command:** Otomatik (nixpacks.toml'dan gelir)
**Start Command:** `npm start` (package.json'dan gelir)

### 4. Environment Variables Ayarlama

Coolify dashboard'da şu environment variables'ları ekleyin:

```bash
# Zorunlu
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Opsiyonel
LOG_LEVEL=info
CORS_ORIGINS=*

# PLC Default Settings (opsiyonel)
DEFAULT_ENDPOINT=opc.tcp://YOUR_PLC_IP:4840
DEFAULT_SECURITY_POLICY=None
DEFAULT_SECURITY_MODE=None
```

**Önemli:** Production'da `CORS_ORIGINS` değerini güvenlik için belirli domainler ile sınırlandırın:
```bash
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### 5. Port Ayarları

- **Internal Port:** 3000 (otomatik tespit edilir)
- **Public Port:** Coolify tarafından atanır veya özel domain kullanabilirsiniz

### 6. Network Ayarları (Önemli!)

PLC'nize erişim için network ayarlarını yapın:

**Seçenek 1: VPN Kullanımı**
- Sunucunuzu PLC'nin olduğu network'e VPN ile bağlayın
- Coolify sunucusunda VPN client kurulumu gerekebilir

**Seçenek 2: Public PLC Access**
- PLC'yi internet'e açın (güvenli değil, önerilmez)
- Firewall kuralları ile sadece Coolify sunucusunun IP'sine izin verin

**Seçenek 3: Özel Network**
- Coolify sunucusunu ve PLC'yi aynı özel network'e yerleştirin

### 7. Health Check Ayarları

Coolify'da health check'i etkinleştirin:

- **Health Check Path:** `/health`
- **Health Check Interval:** 30 saniye
- **Health Check Timeout:** 5 saniye
- **Health Check Retries:** 3

### 8. Deployment

1. Tüm ayarları kaydedin
2. **Deploy** butonuna tıklayın
3. Build loglarını izleyin
4. Deployment tamamlandığında app URL'iniz kullanıma hazır olacak

## 🔍 Deployment Sonrası Kontrol

### 1. Health Check Test

```bash
curl https://your-app-url.coolify.io/health
```

Beklenen response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T14:30:00.000Z",
  "uptime": 123.45
}
```

### 2. API Documentation

```bash
curl https://your-app-url.coolify.io/
```

### 3. PLC Connection Test

```bash
curl -X POST https://your-app-url.coolify.io/api/opcua/connect \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "opc.tcp://YOUR_PLC_IP:4840",
    "securityPolicy": "None",
    "securityMode": "None",
    "authType": "Anonymous"
  }'
```

## 📊 Monitoring ve Logs

### Coolify Dashboard'da:
- **Logs:** Real-time application logs
- **Metrics:** CPU, Memory, Network kullanımı
- **Alerts:** Otomatik uyarı sistemi

### Log Viewing

Coolify dashboard'da **Logs** sekmesinden canlı logları görebilirsiniz:
```bash
# Info logs
OPC UA API Server running on port 3000

# Error logs
Error: Connection failed to PLC
```

## 🔄 Auto Deploy (CI/CD)

Coolify otomatik deploy'u destekler:

1. **Settings** → **Auto Deploy** seçin
2. Webhook URL'ini kopyalayın
3. Git provider'ınıza (GitHub/GitLab) webhook ekleyin
4. Her push'da otomatik deploy edilir

### GitHub Webhook Örneği:
1. Repository → Settings → Webhooks
2. Add webhook
3. Payload URL: Coolify webhook URL'i
4. Content type: `application/json`
5. Events: `Just the push event`

## 🐛 Troubleshooting

### Build Hatası
**Hata:** `npm ci failed`
**Çözüm:** 
- `package-lock.json` dosyasının commit edildiğinden emin olun
- Node version'ın uyumlu olduğunu kontrol edin (18+)

### Connection Timeout
**Hata:** `Cannot connect to PLC`
**Çözüm:**
- PLC IP adresini kontrol edin
- Network bağlantısını test edin
- Firewall kurallarını kontrol edin
- VPN bağlantısını kontrol edin

### Port Already in Use
**Hata:** `Port 3000 already in use`
**Çözüm:**
- Coolify otomatik port atar, bu hata olmamalı
- Eğer olursa, PORT environment variable'ını değiştirin

### CORS Hatası
**Hata:** `CORS policy blocked`
**Çözüm:**
- `CORS_ORIGINS` environment variable'ını doğru domain ile set edin
- Wildcard (*) sadece development için kullanın

## 🔒 Production Güvenlik

### 1. Environment Variables
```bash
NODE_ENV=production
CORS_ORIGINS=https://yourdomain.com
LOG_LEVEL=error  # Production'da daha az log
```

### 2. HTTPS
- Coolify otomatik SSL/TLS sertifikası sağlar (Let's Encrypt)
- Özel domain kullanırsanız otomatik SSL aktif olur

### 3. OPC UA Security
Production'da güvenli bağlantı kullanın:
```json
{
  "securityPolicy": "Basic256Sha256",
  "securityMode": "SignAndEncrypt",
  "authType": "UserPassword",
  "username": "opcua_user",
  "password": "secure_password"
}
```

### 4. Rate Limiting
Express rate limiting middleware ekleyin (opsiyonel):
```bash
npm install express-rate-limit
```

## 📈 Scaling

Coolify ile scaling:

1. **Vertical Scaling:** Server resources artırın
2. **Horizontal Scaling:** Multiple instances (Pro plan gerekir)
3. **Load Balancer:** Coolify otomatik load balancing sağlar

## 🔄 Güncelleme

### Manuel Güncelleme
1. Code'u push edin
2. Coolify dashboard'da **Redeploy** tıklayın

### Otomatik Güncelleme
- Auto deploy aktifse, her push otomatik deploy olur

## 📚 Ek Kaynaklar

- [Coolify Documentation](https://coolify.io/docs)
- [Nixpacks Documentation](https://nixpacks.com/docs)
- [node-opcua Documentation](https://node-opcua.github.io/)

## ✅ Checklist

Deploy öncesi kontrol listesi:

- [ ] `nixpacks.toml` dosyası mevcut
- [ ] `.dockerignore` dosyası mevcut
- [ ] `package.json` engines tanımlı
- [ ] Environment variables hazır
- [ ] PLC network erişimi planlandı
- [ ] Health check endpoint test edildi
- [ ] CORS policy belirlendi
- [ ] SSL/HTTPS aktif
- [ ] Monitoring ayarlandı

## 🆘 Destek

Sorun yaşarsanız:
1. Coolify logs'u kontrol edin
2. Health check endpoint'i test edin
3. Network bağlantısını test edin
4. Environment variables'ları kontrol edin

---

**Not:** Bu API PLC'ye network erişimi gerektirir. Production deployment öncesinde network topolojinizi planlayın.