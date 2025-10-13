const express = require('express');
const router = express.Router();
const opcuaClient = require('../opcua/client');
const logger = require('../utils/logger');

/**
 * POST /api/opcua/connect
 * Connect to OPC UA server
 */
router.post('/connect', async (req, res) => {
  try {
    const { endpoint, securityPolicy, securityMode, authType, username, password } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint is required'
      });
    }

    if (authType === 'UserPassword' && (!username || !password)) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required for UserPassword authentication'
      });
    }

    const result = await opcuaClient.connect({
      endpoint,
      securityPolicy: securityPolicy || 'None',
      securityMode: securityMode || 'None',
      authType: authType || 'Anonymous',
      username: username || '',
      password: password || ''
    });

    res.json(result);
  } catch (error) {
    logger.error('Connect endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect to PLC'
    });
  }
});

/**
 * POST /api/opcua/disconnect
 * Disconnect from OPC UA server
 */
router.post('/disconnect', async (req, res) => {
  try {
    const result = await opcuaClient.disconnect();
    res.json(result);
  } catch (error) {
    logger.error('Disconnect endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disconnect'
    });
  }
});

/**
 * GET /api/opcua/status
 * Get connection status
 */
router.get('/status', (req, res) => {
  try {
    const status = opcuaClient.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Status endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/opcua/read
 * Read a variable from PLC
 */
router.post('/read', async (req, res) => {
  try {
    const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required'
      });
    }

    const result = await opcuaClient.readVariable(nodeId);
    res.json(result);
  } catch (error) {
    logger.error('Read endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to read variable'
    });
  }
});

/**
 * POST /api/opcua/write
 * Write a variable to PLC
 */
router.post('/write', async (req, res) => {
  try {
    const { nodeId, value, dataType } = req.body;

    if (!nodeId || value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        error: 'nodeId and value are required'
      });
    }

    const result = await opcuaClient.writeVariable(nodeId, value, dataType || 'Double');
    res.json(result);
  } catch (error) {
    logger.error('Write endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to write variable'
    });
  }
});

/**
 * POST /api/opcua/browse
 * Browse OPC UA nodes
 */
router.post('/browse', async (req, res) => {
  try {
    const { nodeId } = req.body;
    const result = await opcuaClient.browseNodes(nodeId || 'RootFolder');
    res.json(result);
  } catch (error) {
    logger.error('Browse endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to browse nodes'
    });
  }
});

/**
 * POST /api/opcua/subscribe
 * Subscribe to variable changes
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { nodeId, interval } = req.body;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required'
      });
    }

    const result = await opcuaClient.subscribe(nodeId, interval || 1000);
    res.json(result);
  } catch (error) {
    logger.error('Subscribe endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create subscription'
    });
  }
});

/**
 * POST /api/opcua/unsubscribe
 * Unsubscribe from variable changes
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'subscriptionId is required'
      });
    }

    const result = await opcuaClient.unsubscribe(subscriptionId);
    res.json(result);
  } catch (error) {
    logger.error('Unsubscribe endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unsubscribe'
    });
  }
});

/**
 * POST /api/opcua/register
 * Register a node for efficient access
 */
router.post('/register', async (req, res) => {
  try {
    const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required'
      });
    }

    const result = await opcuaClient.registerNode(nodeId);
    res.json(result);
  } catch (error) {
    logger.error('Register node endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register node'
    });
  }
});

/**
 * POST /api/opcua/unregister
 * Unregister a node
 */
router.post('/unregister', async (req, res) => {
  try {
    const { registeredId } = req.body;

    if (!registeredId) {
      return res.status(400).json({
        success: false,
        error: 'registeredId is required'
      });
    }

    const result = await opcuaClient.unregisterNode(registeredId);
    res.json(result);
  } catch (error) {
    logger.error('Unregister node endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unregister node'
    });
  }
});

/**
 * POST /api/opcua/read-registered
 * Read from a registered node
 */
router.post('/read-registered', async (req, res) => {
  try {
    const { registeredId } = req.body;

    if (!registeredId) {
      return res.status(400).json({
        success: false,
        error: 'registeredId is required'
      });
    }

    const result = await opcuaClient.readRegisteredNode(registeredId);
    res.json(result);
  } catch (error) {
    logger.error('Read registered node endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to read registered node'
    });
  }
});

/**
 * POST /api/opcua/write-registered
 * Write to a registered node
 */
router.post('/write-registered', async (req, res) => {
  try {
    const { registeredId, value, dataType } = req.body;

    if (!registeredId || value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        error: 'registeredId and value are required'
      });
    }

    const result = await opcuaClient.writeRegisteredNode(registeredId, value, dataType || 'Double');
    res.json(result);
  } catch (error) {
    logger.error('Write registered node endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to write to registered node'
    });
  }
});

/**
 * GET /api/opcua/registered-nodes
 * Get list of all registered nodes
 */
router.get('/registered-nodes', (req, res) => {
  try {
    const nodes = opcuaClient.getRegisteredNodes();
    res.json({
      success: true,
      nodes: nodes,
      count: nodes.length
    });
  } catch (error) {
    logger.error('Get registered nodes endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;