# CORS Hatası Düzeltildi

## Yapılan Değişiklikler

### 1. server.js - Geliştirilmiş CORS Yapılandırması
- ✅ Production URL'leri eklendi: `https://opcread.ozkanerozcan.com`
- ✅ Dinamik origin kontrolü eklendi
- ✅ Tüm `ozkanerozcan.com` subdomain'lerine izin verildi
- ✅ OPTIONS (preflight) requestleri için destek eklendi
- ✅ Ek header'lar eklendi: `X-Requested-With`, `Accept`
- ✅ CORS test endpoint'i eklendi: `/api/test-cors`

### 2. .env - Allowed Origins Güncellendi
- ✅ Production URL'leri ALLOWED_ORIGINS'e eklendi

## Server'ı Yeniden Başlatma

### Yerel Test İçin:
```bash
cd opcua-client
npm start
```

### Production Server'da (SSH ile):
```bash
# SSH ile bağlanın
ssh user@opc.ozkanerozcan.com

# Uygulamayı durdurun (pm2 kullanıyorsanız)
pm2 stop opcua-api

# Veya forever kullanıyorsanız
forever stop src/server.js

# Değişiklikleri çekin (git kullanıyorsanız)
git pull origin main

# Dependencies'i güncelleyin
npm install

# .env dosyasını güncelleyin
nano .env
# ALLOWED_ORIGINS satırına production URL'leri ekleyin

# Uygulamayı yeniden başlatın (pm2)
pm2 restart opcua-api

# Veya (forever)
forever start src/server.js

# Veya (node)
node src/server.js
```

### PM2 Kullanıyorsanız:
```bash
cd opcua-client
pm2 reload opcua-api --update-env
```

### Docker Kullanıyorsanız:
```bash
docker-compose down
docker-compose up -d --build
```

## Test Etme

### 1. CORS Test Endpoint'ini Test Edin:
```bash
# Terminal'den
curl https://opc.ozkanerozcan.com/api/test-cors

# Veya tarayıcıdan
https://opc.ozkanerozcan.com/api/test-cors
```

Beklenen yanıt:
```json
{
  "success": true,
  "message": "CORS is working!",
  "origin": "...",
  "timestamp": "..."
}
```

### 2. Frontend'den Test Edin:
```bash
cd expo-app
npm run web
```

Ardından PLC Connection sayfasından bağlanmayı deneyin.

### 3. Tarayıcı Console'da Kontrol:
- F12 > Console
- CORS hataları olmamalı
- Network tab'da preflight OPTIONS request'leri başarılı olmalı (200 OK)

## Hata Giderme

### Hala CORS Hatası Alıyorsanız:

1. **Server'ın çalıştığını kontrol edin:**
```bash
curl https://opc.ozkanerozcan.com/health
```

2. **CORS header'ları kontrol edin:**
```bash
curl -H "Origin: https://opcread.ozkanerozcan.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     -v \
     https://opc.ozkanerozcan.com/api/opcua/connect
```

Response'da şunları görmelisiniz:
```
Access-Control-Allow-Origin: https://opcread.ozkanerozcan.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept
Access-Control-Allow-Credentials: true
```

3. **Nginx/Apache kullanıyorsanız:**

Nginx'te CORS header'ları ekleyin:
```nginx
location /api/ {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Content-Length' 0;
        add_header 'Content-Type' 'text/plain';
        return 204;
    }
    
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

4. **Cloudflare kullanıyorsanız:**
- Cloudflare Dashboard > SSL/TLS > Overview
- SSL/TLS encryption mode'u "Full" veya "Full (strict)" yapın
- Cloudflare > Speed > Optimization > Auto Minify'ı kapatın (geçici)

5. **Reverse Proxy kontrol:**
Eğer nginx/apache reverse proxy kullanıyorsanız, proxy'nin CORS header'larını geçirdiğinden emin olun.

## Kalıcı Çözüm

Production'da server yeniden başlatıldıktan sonra test edin. Sorun devam ederse:

1. Server log'larını kontrol edin:
```bash
# PM2
pm2 logs opcua-api

# Forever
forever logs

# Node
# Log dosyasını kontrol edin (opcua-client/logs/)
```

2. Backend'in gerçekten güncellendiğini doğrulayın:
```bash
curl https://opc.ozkanerozcan.com/api/test-cors
```

## Ek Notlar

- Server değişiklikleri deploy edilmediyse, local'den test edilebilir
- Production'da değişiklik yapıldıysa, sunucuyu mutlaka yeniden başlatın
- Tarayıcı cache'ini temizleyin (Ctrl+Shift+R veya Cmd+Shift+R)
- Frontend'den yeni request atıldığında CORS hatası gitmeli

## İletişim

Sorun devam ederse:
1. Server log'larını paylaşın
2. Browser console'daki tam hata mesajını paylaşın
3. `curl` test sonuçlarını paylaşın
