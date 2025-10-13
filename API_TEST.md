# API Test Guide - https://opc.ozkanerozcan.com

Bu rehber, deploy edilmiş OPC UA API'nizi test etmek için kullanılabilir.

## 🔍 Health Check

```bash
curl https://opc.ozkanerozcan.com/health
```

**Beklenen Cevap:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-12T14:18:30.668Z",
  "uptime": 124.789723058
}
```

## 📖 API Documentation

```bash
curl https://opc.ozkanerozcan.com/
```

**Beklenen Cevap:**
```json
{
  "name": "S7-1500 OPC UA API Server",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "connect": "POST /api/opcua/connect",
    "disconnect": "POST /api/opcua/disconnect",
    "status": "GET /api/opcua/status",
    "read": "POST /api/opcua/read",
    "write": "POST /api/opcua/write",
    "browse": "POST /api/opcua/browse",
    "subscribe": "POST /api/opcua/subscribe",
    "unsubscribe": "POST /api/opcua/unsubscribe"
  }
}
```

## 🔌 PLC'ye Bağlanma

```bash
curl -X POST https://opc.ozkanerozcan.com/api/opcua/connect \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "opc.tcp://YOUR_PLC_IP:4840",
    "securityPolicy": "None",
    "securityMode": "None",
    "authType": "Anonymous"
  }'
```

**Örnek - Başarılı:**
```json
{
  "success": true,
  "message": "Connected to PLC successfully",
  "endpoint": "opc.tcp://192.168.1.100:4840"
}
```

**Örnek - Hata:**
```json
{
  "success": false,
  "error": "Connection timeout"
}
```

## 📊 Bağlantı Durumu

```bash
curl https://opc.ozkanerozcan.com/api/opcua/status
```

**Bağlı:**
```json
{
  "connected": true,
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "sessionActive": true
}
```

**Bağlı Değil:**
```json
{
  "connected": false,
  "endpoint": null,
  "sessionActive": false
}
```

## 📖 Değişken Okuma

```bash
curl -X POST https://opc.ozkanerozcan.com/api/opcua/read \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "ns=3;s=\"DB1\".\"Temperature\""
  }'
```

**Başarılı:**
```json
{
  "success": true,
  "value": 25.5,
  "dataType": "Double",
  "statusCode": "Good (0x00000)",
  "timestamp": "2025-10-12T14:30:00.000Z"
}
```

## ✍️ Değişken Yazma

```bash
curl -X POST https://opc.ozkanerozcan.com/api/opcua/write \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "ns=3;s=\"DB1\".\"SetPoint\"",
    "value": 30.5,
    "dataType": "Double"
  }'
```

**Başarılı:**
```json
{
  "success": true,
  "message": "Value written successfully",
  "statusCode": "Good (0x00000)"
}
```

## 🔍 Node Tarama

```bash
curl -X POST https://opc.ozkanerozcan.com/api/opcua/browse \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "RootFolder"
  }'
```

**Başarılı:**
```json
{
  "success": true,
  "nodes": [
    {
      "nodeId": "ns=3;s=DB1",
      "browseName": "3:DB1",
      "displayName": "DB1",
      "nodeClass": "Object",
      "isForward": true
    }
  ]
}
```

## 🔄 Bağlantı Kesme

```bash
curl -X POST https://opc.ozkanerozcan.com/api/opcua/disconnect
```

**Başarılı:**
```json
{
  "success": true,
  "message": "Disconnected successfully"
}
```

## 🎯 JavaScript ile Kullanım

```javascript
const API_BASE = 'https://opc.ozkanerozcan.com';

// Bağlan
async function connect() {
  const response = await fetch(`${API_BASE}/api/opcua/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: 'opc.tcp://192.168.1.100:4840',
      securityPolicy: 'None',
      securityMode: 'None',
      authType: 'Anonymous'
    })
  });
  return await response.json();
}

// Oku
async function read(nodeId) {
  const response = await fetch(`${API_BASE}/api/opcua/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId })
  });
  return await response.json();
}

// Yaz
async function write(nodeId, value, dataType = 'Double') {
  const response = await fetch(`${API_BASE}/api/opcua/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, value, dataType })
  });
  return await response.json();
}

// Kullanım
await connect();
const temp = await read('ns=3;s="DB1"."Temperature"');
console.log('Temperature:', temp.value);
await write('ns=3;s="DB1"."SetPoint"', 25.5);
```

## 🔒 Güvenli Bağlantı (Production)

```bash
curl -X POST https://opc.ozkanerozcan.com/api/opcua/connect \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "opc.tcp://192.168.1.100:4840",
    "securityPolicy": "Basic256Sha256",
    "securityMode": "SignAndEncrypt",
    "authType": "UserPassword",
    "username": "opcua_user",
    "password": "your_password"
  }'
```

## 📱 React Native App Kullanımı

Expo uygulamanız otomatik olarak bu API'yi kullanacak şekilde yapılandırıldı:

```javascript
// config.js otomatik olarak production URL'i kullanır
import { API_BASE_URL } from './config';

console.log(API_BASE_URL); // https://opc.ozkanerozcan.com
```

Development'ta (npm start ile çalıştırırken) otomatik olarak localhost:3000 kullanır.

## ⚠️ Önemli Notlar

1. **Network Erişimi**: PLC'nize sunucunuzdan erişim olması gerekiyor
2. **Güvenlik**: Production'da mutlaka güvenli bağlantı kullanın
3. **CORS**: API tüm origin'lere açık, production'da kısıtlayın
4. **Timeout**: PLC'ye bağlantı 30 saniye timeout'a sahip

## 🐛 Sorun Giderme

### Cannot connect to PLC
- PLC IP adresini kontrol edin
- Network bağlantısını test edin: `ping PLC_IP`
- Port 4840'ın açık olduğundan emin olun
- Firewall kurallarını kontrol edin

### Connection timeout
- PLC'nin OPC UA Server'ının aktif olduğundan emin olun
- TIA Portal'da OPC UA Server ayarlarını kontrol edin
- VPN bağlantınızı kontrol edin (varsa)

### Read/Write failed
- Node ID formatını kontrol edin
- PLC'de değişkenin "Accessible from HMI/OPC UA" olduğundan emin olun
- Data type'ın doğru olduğundan emin olun

## 📈 Monitoring

Coolify dashboard'dan:
- **Logs**: Real-time uygulama logları
- **Metrics**: CPU, Memory, Network kullanımı
- **Health**: Otomatik health check

---

**API URL**: https://opc.ozkanerozcan.com
**Status**: ✅ Online and Running