# S7-1500 OPC UA Client API

A Node.js OPC UA Client API for communicating with Siemens S7-1500 PLC. Built with Express.js and node-opcua.

## 🎯 Features

- ✅ **OPC UA Client** - Full-featured client for S7-1500 PLC
- ✅ **REST API** - Complete RESTful API for PLC operations
- ✅ **Security** - Support for all OPC UA security policies and modes
- ✅ **Authentication** - Anonymous and Username/Password authentication
- ✅ **Production Grade** - Error handling, logging, health checks
- ✅ **Real-time Subscriptions** - Monitor variable changes
- ✅ **Node Browsing** - Discover available PLC nodes

## 📋 Requirements

- Node.js 18+
- npm or yarn
- S7-1500 PLC with OPC UA Server enabled
- Network access to PLC

## 🚀 Quick Start

### Installation

```bash
# Navigate to the project
cd opcua-client

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start the server
npm start
```

Server will be available at: `http://localhost:3000`

### Development Mode

```bash
# Run with auto-reload (nodemon)
npm run dev
```

## 📡 API Endpoints

Base URL: `http://localhost:3000`

### Health Check
```http
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2024-01-10T14:30:00.000Z",
  "uptime": 123.45
}
```

### Root Endpoint (API Documentation)
```http
GET /

Response:
{
  "name": "S7-1500 OPC UA API Server",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "connect": "POST /api/opcua/connect",
    "disconnect": "POST /api/opcua/disconnect",
    ...
  }
}
```

### Connect to PLC
```http
POST /api/opcua/connect
Content-Type: application/json

{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "securityPolicy": "None",
  "securityMode": "None",
  "authType": "Anonymous",
  "username": "",
  "password": ""
}

Response:
{
  "success": true,
  "message": "Connected to PLC successfully",
  "endpoint": "opc.tcp://192.168.1.100:4840"
}
```

### Disconnect from PLC
```http
POST /api/opcua/disconnect

Response:
{
  "success": true,
  "message": "Disconnected successfully"
}
```

### Get Connection Status
```http
GET /api/opcua/status

Response:
{
  "connected": true,
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "sessionActive": true
}
```

### Read Variable
```http
POST /api/opcua/read
Content-Type: application/json

{
  "nodeId": "ns=3;s=\"DB1\".\"Temperature\""
}

Response:
{
  "success": true,
  "value": 25.5,
  "dataType": "Double",
  "statusCode": "Good (0x00000)",
  "timestamp": "2024-01-10T14:30:00.000Z"
}
```

### Write Variable
```http
POST /api/opcua/write
Content-Type: application/json

{
  "nodeId": "ns=3;s=\"DB1\".\"SetPoint\"",
  "value": 30.5,
  "dataType": "Double"
}

Response:
{
  "success": true,
  "message": "Value written successfully",
  "statusCode": "Good (0x00000)"
}
```

### Browse Nodes
```http
POST /api/opcua/browse
Content-Type: application/json

{
  "nodeId": "RootFolder"
}

Response:
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

### Subscribe to Variable
```http
POST /api/opcua/subscribe
Content-Type: application/json

{
  "nodeId": "ns=3;s=\"DB1\".\"Temperature\"",
  "interval": 1000
}

Response:
{
  "success": true,
  "subscriptionId": "sub_1234567890",
  "message": "Subscription created successfully"
}
```

### Unsubscribe
```http
POST /api/opcua/unsubscribe
Content-Type: application/json

{
  "subscriptionId": "sub_1234567890"
}

Response:
{
  "success": true,
  "message": "Unsubscribed successfully"
}
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info

# CORS Origins (for production, specify your domain)
CORS_ORIGINS=*
```

### Security Policies

Supported security policies:
- `None` - No security (development)
- `Basic128Rsa15` - Basic 128-bit encryption
- `Basic256` - 256-bit encryption
- `Basic256Sha256` - 256-bit with SHA256 (recommended for production)

### Security Modes

Supported security modes:
- `None` - No security
- `Sign` - Message signing only
- `SignAndEncrypt` - Sign and encrypt messages (recommended for production)

### Data Types

Supported data types for write operations:
- `Boolean`
- `Int16`
- `Int32`
- `Float`
- `Double` (default)
- `String`

## 📊 S7-1500 PLC Setup

### 1. Enable OPC UA Server in TIA Portal

1. Open your project in TIA Portal
2. Select PLC → Properties → General → OPC UA
3. Check **"Enable OPC UA Server"**
4. Configure security settings
5. Set port to 4840 (default)

### 2. Create Data Block

Example DB1:
```
DB1:
  Temperature : Real    // ns=3;s="DB1"."Temperature"
  Pressure    : Real    // ns=3;s="DB1"."Pressure"
  SetPoint    : Real    // ns=3;s="DB1"."SetPoint"
  Motor_Start : Bool    // ns=3;s="DB1"."Motor_Start"
  Status      : Int     // ns=3;s="DB1"."Status"
```

### 3. Make Variables Accessible

1. Right-click on DB1 → Properties
2. Go to **Attributes** tab
3. Check **"Accessible from HMI/OPC UA"**
4. Compile and download to PLC

## 🔍 Node ID Format

OPC UA Node IDs for S7-1500:

```
ns=3;s="DB1"."Temperature"           // Basic variable
ns=3;s="DB1"."Pressure"              // Another variable
ns=3;s="DB2"."Motor1"."Speed"        // Nested structure
ns=3;s="DB3"."Values"[0]             // Array element
```

Format breakdown:
- `ns=3` - Namespace (usually 3 for PLC variables)
- `s="DB1"` - Data Block name
- `"Temperature"` - Variable name

## 🧪 Testing

### Using cURL

```bash
# Health check
curl http://localhost:3000/health

# Connect to PLC
curl -X POST http://localhost:3000/api/opcua/connect \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "opc.tcp://192.168.1.100:4840",
    "securityPolicy": "None",
    "securityMode": "None",
    "authType": "Anonymous"
  }'

# Check status
curl http://localhost:3000/api/opcua/status

# Read variable
curl -X POST http://localhost:3000/api/opcua/read \
  -H "Content-Type: application/json" \
  -d '{"nodeId": "ns=3;s=\"DB1\".\"Temperature\""}'

# Write variable
curl -X POST http://localhost:3000/api/opcua/write \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "ns=3;s=\"DB1\".\"SetPoint\"",
    "value": 25.5,
    "dataType": "Double"
  }'

# Disconnect
curl -X POST http://localhost:3000/api/opcua/disconnect
```

### Using the React Native App

1. Start this OPC UA client: `npm start`
2. Start React Native app: `cd expo-app && npm start`
3. Navigate to Settings → PLC Connection
4. Enter endpoint and connect
5. Use Read/Write Test page

## 📝 Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

Logs are printed to console in development mode.

## 📦 Project Structure

```
opcua-client/
├── src/
│   ├── server.js           # Main Express server
│   ├── opcua/
│   │   └── client.js       # OPC UA client manager
│   ├── routes/
│   │   └── opcua.js        # API routes
│   └── utils/
│       └── logger.js       # Winston logger
├── logs/                   # Log files (auto-created)
├── package.json           # Dependencies
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## 🐛 Troubleshooting

### Cannot connect to PLC

**Solutions:**
- Verify PLC IP address: `ping 192.168.1.100`
- Check OPC UA port: `telnet 192.168.1.100 4840`
- Ensure OPC UA Server is enabled in TIA Portal
- Verify firewall settings (port 4840)
- Check security policy/mode compatibility with PLC settings

### Cannot read/write variables

**Solutions:**
- Verify Node ID format is correct
- Check variable accessibility in TIA Portal (Accessible from HMI/OPC UA)
- Ensure data types match
- Verify user permissions (if using authentication)
- Check PLC is in RUN mode

### Server won't start

**Solutions:**
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000   # Windows
lsof -i :3000                  # Mac/Linux

# Install dependencies again
npm install

# Check logs
cat logs/error.log
```

## 🔒 Security Best Practices

1. **Production Environment:**
   - Use HTTPS (reverse proxy like nginx)
   - Enable authentication (`UserPassword`)
   - Use `Basic256Sha256` security policy
   - Use `SignAndEncrypt` security mode

2. **Network Security:**
   - Limit CORS origins (don't use `*` in production)
   - Use firewall rules
   - VPN for remote access

3. **Credentials:**
   - Use environment variables
   - Never commit `.env` file
   - Rotate passwords regularly

## 📈 Performance Tips

1. **Connection Management** - Keep connection alive
2. **Subscriptions** - Use for frequently accessed variables
3. **Batch Operations** - Group multiple reads/writes
4. **Caching** - Cache static configuration
5. **Error Handling** - Implement retry logic

## 🧰 Development

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Run in production mode
npm start

# Test basic functionality
npm test
```

## 🔄 Integration with React Native App

The React Native app in `../expo-app` is pre-configured:

1. Start this server: `npm start`
2. Start React Native app: `cd ../expo-app && npm start`
3. App connects to `http://localhost:3000` by default

## 📚 API Examples

### JavaScript/TypeScript

```javascript
const API = 'http://localhost:3000/api/opcua';

// Connect
const connect = async () => {
  const res = await fetch(`${API}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: 'opc.tcp://192.168.1.100:4840',
      securityPolicy: 'None',
      securityMode: 'None',
      authType: 'Anonymous'
    })
  });
  return res.json();
};

// Read
const read = async (nodeId) => {
  const res = await fetch(`${API}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId })
  });
  return res.json();
};

// Write
const write = async (nodeId, value) => {
  const res = await fetch(`${API}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, value, dataType: 'Double' })
  });
  return res.json();
};
```

### Python

```python
import requests

API = 'http://localhost:3000/api/opcua'

# Connect
def connect():
    res = requests.post(f'{API}/connect', json={
        'endpoint': 'opc.tcp://192.168.1.100:4840',
        'securityPolicy': 'None',
        'securityMode': 'None',
        'authType': 'Anonymous'
    })
    return res.json()

# Read
def read_variable(node_id):
    res = requests.post(f'{API}/read', json={'nodeId': node_id})
    return res.json()

# Write
def write_variable(node_id, value):
    res = requests.post(f'{API}/write', json={
        'nodeId': node_id,
        'value': value,
        'dataType': 'Double'
    })
    return res.json()
```

## 🔐 Security Configuration Examples

### With Username/Password + Encryption

```json
{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "securityPolicy": "Basic256Sha256",
  "securityMode": "SignAndEncrypt",
  "authType": "UserPassword",
  "username": "opcua_user",
  "password": "your_secure_password"
}
```

### Anonymous with Signing Only

```json
{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "securityPolicy": "Basic256",
  "securityMode": "Sign",
  "authType": "Anonymous"
}
```

## 📊 Common Node ID Examples

```javascript
// Data Block variables
"ns=3;s=\"DB1\".\"Temperature\""      // Real/Float
"ns=3;s=\"DB1\".\"Pressure\""         // Real/Float
"ns=3;s=\"DB1\".\"Motor_Start\""      // Bool
"ns=3;s=\"DB1\".\"Counter\""          // Int

// Nested structures
"ns=3;s=\"DB2\".\"Motor1\".\"Speed\""
"ns=3;s=\"DB2\".\"Tank1\".\"Level\""

// Array elements
"ns=3;s=\"DB3\".\"Values\"[0]"
"ns=3;s=\"DB3\".\"Values\"[5]"
```

## 🎛️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

## 🏗️ Architecture

```
┌─────────────────────┐
│  React Native App   │
│  (Mobile/Web)       │
│  Expo + React       │
└──────────┬──────────┘
           │ HTTP REST API
           │ (localhost:3000)
┌──────────▼──────────┐
│  Node.js API        │
│  Express + OPC UA   │
│  This Server        │
└──────────┬──────────┘
           │ OPC UA Protocol
           │ (Port 4840)
┌──────────▼──────────┐
│  S7-1500 PLC        │
│  OPC UA Server      │
│  Siemens TIA        │
└─────────────────────┘
```

## 🧪 Testing Flow

### 1. Test Server
```bash
# Start server
npm start

# In another terminal, test health
curl http://localhost:3000/health
```

### 2. Test Connection (without PLC)
```bash
# This will fail (no real PLC) but shows API works
curl -X POST http://localhost:3000/api/opcua/connect \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "opc.tcp://192.168.1.100:4840",
    "securityPolicy": "None",
    "securityMode": "None",
    "authType": "Anonymous"
  }'
```

### 3. Test with Real PLC
1. Ensure PLC is accessible on network
2. Enable OPC UA Server in PLC
3. Use the connect endpoint above with correct IP
4. Test read/write with actual Node IDs

## 📝 Server Commands

```bash
# Install dependencies
npm install

# Start production server
npm start

# Start development server (auto-reload)
npm run dev

# Run tests
npm test

# View logs
tail -f logs/combined.log      # All logs
tail -f logs/error.log         # Errors only
```

## 🔮 Future Enhancements

- [ ] WebSocket support for real-time updates
- [ ] Data logging to database (MongoDB/PostgreSQL)
- [ ] Historical data access and trending
- [ ] Batch read/write operations
- [ ] Alarm and event handling
- [ ] Multiple PLC connections
- [ ] Authentication with JWT tokens
- [ ] API rate limiting
- [ ] Prometheus metrics endpoint

## 📄 License

MIT

## 🤝 Support

For issues:
1. Check logs in `logs/` directory
2. Verify PLC OPC UA settings in TIA Portal
3. Test network connectivity
4. Review this README

---

Simple, standalone Node.js OPC UA Client API - No Docker required! 🚀