const express = require('express');
const cors = require('cors');
const opcuaRoutes = require('./routes/opcua');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:8081', 'http://localhost:19000', 'http://localhost:19001', 'http://localhost:19006'];

// Middleware
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    body: req.body,
    query: req.query
  });
  next();
});

// Routes
app.use('/api/opcua', opcuaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'S7-1500 OPC UA API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      connect: 'POST /api/opcua/connect',
      disconnect: 'POST /api/opcua/disconnect',
      status: 'GET /api/opcua/status',
      read: 'POST /api/opcua/read',
      write: 'POST /api/opcua/write',
      browse: 'POST /api/opcua/browse',
      subscribe: 'POST /api/opcua/subscribe',
      unsubscribe: 'POST /api/opcua/unsubscribe'
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`OPC UA API Server running on port ${PORT}`);
  logger.info(`Health check: http://0.0.0.0:${PORT}/health`);
  logger.info(`API documentation: http://0.0.0.0:${PORT}/`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});