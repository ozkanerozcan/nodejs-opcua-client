const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
  AttributeIds,
  ClientSession,
  DataType,
  MonitoringMode
} = require('node-opcua');
const logger = require('../utils/logger');

class OPCUAClientManager {
  constructor() {
    this.client = null;
    this.session = null;
    this.isConnected = false;
    this.connectionConfig = null;
    this.subscriptions = new Map();
    this.registeredNodes = new Map(); // Store registered nodes: Map<serverNodeId, originalNodeId>
  }

  /**
   * Connect to OPC UA server
   */
  async connect(config) {
    try {
      if (this.isConnected) {
        throw new Error('Already connected. Disconnect first.');
      }

      const { endpoint, securityPolicy, securityMode, authType, username, password } = config;

      // Map security policy
      const securityPolicyMap = {
        'None': SecurityPolicy.None,
        'Basic128Rsa15': SecurityPolicy.Basic128Rsa15,
        'Basic256': SecurityPolicy.Basic256,
        'Basic256Sha256': SecurityPolicy.Basic256Sha256
      };

      // Map security mode
      const securityModeMap = {
        'None': MessageSecurityMode.None,
        'Sign': MessageSecurityMode.Sign,
        'SignAndEncrypt': MessageSecurityMode.SignAndEncrypt
      };

      // Create client options
      const clientOptions = {
        applicationName: 'S7-1500 OPC UA Client',
        connectionStrategy: {
          initialDelay: 1000,
          maxRetry: 3
        },
        securityMode: securityModeMap[securityMode] || MessageSecurityMode.None,
        securityPolicy: securityPolicyMap[securityPolicy] || SecurityPolicy.None,
        endpointMustExist: false
      };

      // Create client
      this.client = OPCUAClient.create(clientOptions);

      // Connect to endpoint
      await this.client.connect(endpoint);
      logger.info(`Connected to OPC UA server: ${endpoint}`);

      // Create session based on auth type
      let userIdentity;
      if (authType === 'UserPassword' && username && password) {
        userIdentity = {
          userName: username,
          password: password,
          type: UserTokenType.UserName
        };
      } else {
        userIdentity = { type: UserTokenType.Anonymous };
      }

      this.session = await this.client.createSession(userIdentity);
      logger.info('OPC UA session created successfully');

      this.isConnected = true;
      this.connectionConfig = config;

      return {
        success: true,
        message: 'Connected to PLC successfully',
        endpoint: endpoint
      };
    } catch (error) {
      logger.error('Connection error:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Disconnect from OPC UA server
   */
  async disconnect() {
    try {
      await this.cleanup();
      logger.info('Disconnected from OPC UA server');
      return {
        success: true,
        message: 'Disconnected successfully'
      };
    } catch (error) {
      logger.error('Disconnect error:', error);
      throw error;
    }
  }

  /**
   * Read a variable from PLC
   */
  async readVariable(nodeId) {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const dataValue = await this.session.read({
        nodeId: nodeId,
        attributeId: AttributeIds.Value
      });

      if (dataValue.statusCode.isGood()) {
        return {
          success: true,
          value: dataValue.value.value,
          dataType: DataType[dataValue.value.dataType],
          statusCode: dataValue.statusCode.toString(),
          timestamp: dataValue.serverTimestamp || new Date().toISOString()
        };
      } else {
        throw new Error(`Read failed: ${dataValue.statusCode.toString()}`);
      }
    } catch (error) {
      logger.error('Read error:', error);
      throw error;
    }
  }

  /**
   * Write a variable to PLC
   */
  async writeVariable(nodeId, value, dataType = 'Double') {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      // Map dataType string to DataType enum (support various OPC UA type names)
      const dataTypeLower = (dataType || 'Double').toLowerCase();
      let mappedDataType = DataType.Double; // default
      let parsedValue = value;

      if (dataTypeLower.includes('bool')) {
        mappedDataType = DataType.Boolean;
      } else if (dataTypeLower.includes('byte') || dataTypeLower.includes('sbyte')) {
        mappedDataType = DataType.Byte;
      } else if (dataTypeLower.includes('int16')) {
        mappedDataType = DataType.Int16;
      } else if (dataTypeLower.includes('uint16') || dataTypeLower.includes('word')) {
        mappedDataType = DataType.UInt16;
      } else if (dataTypeLower.includes('int32') || dataTypeLower.includes('int') || dataTypeLower.includes('dint')) {
        mappedDataType = DataType.Int32;
      } else if (dataTypeLower.includes('uint32') || dataTypeLower.includes('dword')) {
        mappedDataType = DataType.UInt32;
      } else if (dataTypeLower.includes('float') || dataTypeLower.includes('real')) {
        mappedDataType = DataType.Float;
      } else if (dataTypeLower.includes('double') || dataTypeLower.includes('lreal')) {
        mappedDataType = DataType.Double;
      } else if (dataTypeLower.includes('string')) {
        mappedDataType = DataType.String;
        parsedValue = String(value);
      }

      const nodeToWrite = {
        nodeId: nodeId,
        attributeId: AttributeIds.Value,
        value: {
          value: {
            dataType: mappedDataType,
            value: parsedValue
          }
        }
      };

      const statusCode = await this.session.write(nodeToWrite);

      if (statusCode.isGood()) {
        return {
          success: true,
          message: 'Value written successfully',
          statusCode: statusCode.toString()
        };
      } else {
        throw new Error(`Write failed: ${statusCode.toString()}`);
      }
    } catch (error) {
      logger.error('Write error:', error);
      throw error;
    }
  }

  /**
   * Browse nodes
   */
  async browseNodes(nodeId = 'RootFolder') {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const browseResult = await this.session.browse(nodeId);
      
      const nodes = browseResult.references.map(ref => ({
        nodeId: ref.nodeId.toString(),
        browseName: ref.browseName.toString(),
        displayName: ref.displayName?.text || '',
        nodeClass: ref.nodeClass.toString(),
        isForward: ref.isForward
      }));

      return {
        success: true,
        nodes: nodes
      };
    } catch (error) {
      logger.error('Browse error:', error);
      throw error;
    }
  }

  /**
   * Subscribe to variable changes
   */
  async subscribe(nodeId, interval = 1000) {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const subscription = await this.session.createSubscription2({
        requestedPublishingInterval: interval,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
      });

      const monitoredItem = await subscription.monitor(
        {
          nodeId: nodeId,
          attributeId: AttributeIds.Value
        },
        {
          samplingInterval: interval,
          discardOldest: true,
          queueSize: 10
        },
        MonitoringMode.Reporting
      );

      const subscriptionId = `sub_${Date.now()}`;
      this.subscriptions.set(subscriptionId, {
        subscription,
        monitoredItem,
        nodeId
      });

      // Handle data changes
      monitoredItem.on('changed', (dataValue) => {
        logger.info(`Value changed for ${nodeId}:`, dataValue.value.value);
        // You can emit this via WebSocket or store for polling
      });

      return {
        success: true,
        subscriptionId: subscriptionId,
        message: 'Subscription created successfully'
      };
    } catch (error) {
      logger.error('Subscribe error:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from variable
   */
  async unsubscribe(subscriptionId) {
    try {
      const sub = this.subscriptions.get(subscriptionId);
      if (!sub) {
        throw new Error('Subscription not found');
      }

      await sub.subscription.terminate();
      this.subscriptions.delete(subscriptionId);

      return {
        success: true,
        message: 'Unsubscribed successfully'
      };
    } catch (error) {
      logger.error('Unsubscribe error:', error);
      throw error;
    }
  }

  /**
   * Register a node for efficient repeated access
   * OPC UA servers can optimize access to registered nodes
   */
  async registerNode(nodeId) {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      logger.info(`Attempting to register node: ${nodeId}`);

      // First, try to read the node to verify it exists and is accessible
      try {
        const testRead = await this.session.read({
          nodeId: nodeId,
          attributeId: AttributeIds.Value
        });

        if (!testRead.statusCode.isGood()) {
          throw new Error(`Node not accessible: ${testRead.statusCode.toString()}. The variable may not exist in PLC or is not accessible.`);
        }

        logger.info(`Node verified successfully: ${nodeId}`);
      } catch (readError) {
        logger.error(`Failed to verify node: ${nodeId}`, readError);
        throw new Error(`Cannot register node: ${nodeId}. ${readError.message || 'Node does not exist or is not accessible in PLC.'}`);
      }

      // Register node with OPC UA server
      const registeredNodeIds = await this.session.registerNodes([nodeId]);
      
      if (!registeredNodeIds || registeredNodeIds.length === 0) {
        throw new Error('Failed to register node on server');
      }

      const serverRegisteredNodeId = registeredNodeIds[0].toString();
      
      // Store mapping: server's registered ID -> original nodeId
      this.registeredNodes.set(serverRegisteredNodeId, {
        originalNodeId: nodeId,
        registeredAt: new Date().toISOString()
      });

      logger.info(`Node registered: ${nodeId} -> Server ID: ${serverRegisteredNodeId}`);

      return {
        success: true,
        registeredId: serverRegisteredNodeId,
        nodeId: nodeId,
        message: 'Node registered successfully'
      };
    } catch (error) {
      logger.error('Register node error:', error);
      throw error;
    }
  }

  /**
   * Unregister a node
   */
  async unregisterNode(registeredId) {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const nodeInfo = this.registeredNodes.get(registeredId);
      if (!nodeInfo) {
        throw new Error('Registered node not found');
      }

      // Unregister from OPC UA server
      await this.session.unregisterNodes([registeredId]);
      
      // Remove from our map
      this.registeredNodes.delete(registeredId);

      logger.info(`Node unregistered: ${nodeInfo.originalNodeId}`);

      return {
        success: true,
        message: 'Node unregistered successfully'
      };
    } catch (error) {
      logger.error('Unregister node error:', error);
      throw error;
    }
  }

  /**
   * Read from a registered node (more efficient)
   */
  async readRegisteredNode(registeredId) {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const nodeInfo = this.registeredNodes.get(registeredId);
      if (!nodeInfo) {
        throw new Error('Registered node not found');
      }

      // Use the server-registered node ID for reading
      const dataValue = await this.session.read({
        nodeId: registeredId,
        attributeId: AttributeIds.Value
      });

      if (dataValue.statusCode.isGood()) {
        return {
          success: true,
          value: dataValue.value.value,
          dataType: DataType[dataValue.value.dataType],
          statusCode: dataValue.statusCode.toString(),
          timestamp: dataValue.serverTimestamp || new Date().toISOString()
        };
      } else {
        throw new Error(`Read failed: ${dataValue.statusCode.toString()}`);
      }
    } catch (error) {
      logger.error('Read registered node error:', error);
      throw error;
    }
  }

  /**
   * Write to a registered node (more efficient)
   */
  async writeRegisteredNode(registeredId, value, dataType = 'Double') {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const nodeInfo = this.registeredNodes.get(registeredId);
      if (!nodeInfo) {
        throw new Error(`Registered node not found: ${registeredId}`);
      }

      logger.info(`Writing to registered node: ${registeredId}, value: ${value}, dataType: ${dataType}`);

      // Map dataType string to DataType enum (support various OPC UA type names)
      const dataTypeLower = (dataType || 'Double').toLowerCase();
      let mappedDataType = DataType.Double; // default
      let parsedValue = value;

      if (dataTypeLower.includes('bool')) {
        mappedDataType = DataType.Boolean;
        // No parsing needed, value should already be boolean
      } else if (dataTypeLower.includes('byte') || dataTypeLower.includes('sbyte')) {
        mappedDataType = DataType.Byte;
        // No parsing needed, value should already be number
      } else if (dataTypeLower.includes('int16')) {
        mappedDataType = DataType.Int16;
        // No parsing needed
      } else if (dataTypeLower.includes('uint16') || dataTypeLower.includes('word')) {
        mappedDataType = DataType.UInt16;
        // No parsing needed
      } else if (dataTypeLower.includes('int32') || dataTypeLower.includes('int') || dataTypeLower.includes('dint')) {
        mappedDataType = DataType.Int32;
        // No parsing needed
      } else if (dataTypeLower.includes('uint32') || dataTypeLower.includes('dword')) {
        mappedDataType = DataType.UInt32;
        // No parsing needed
      } else if (dataTypeLower.includes('float') || dataTypeLower.includes('real')) {
        mappedDataType = DataType.Float;
        // No parsing needed
      } else if (dataTypeLower.includes('double') || dataTypeLower.includes('lreal')) {
        mappedDataType = DataType.Double;
        // No parsing needed
      } else if (dataTypeLower.includes('string')) {
        mappedDataType = DataType.String;
        parsedValue = String(value);
      }

      const nodeToWrite = {
        nodeId: registeredId,
        attributeId: AttributeIds.Value,
        value: {
          value: {
            dataType: mappedDataType,
            value: parsedValue
          }
        }
      };

      const statusCode = await this.session.write(nodeToWrite);

      if (statusCode.isGood()) {
        logger.info(`Write successful to ${registeredId}`);
        return {
          success: true,
          message: 'Value written successfully',
          statusCode: statusCode.toString()
        };
      } else {
        throw new Error(`Write failed: ${statusCode.toString()}`);
      }
    } catch (error) {
      logger.error('Write registered node error:', error);
      throw error;
    }
  }

  /**
   * Get all registered nodes
   */
  getRegisteredNodes() {
    const nodes = [];
    for (const [registeredId, info] of this.registeredNodes) {
      nodes.push({
        registeredId: registeredId,
        nodeId: info.originalNodeId,
        registeredAt: info.registeredAt
      });
    }
    return nodes;
  }

  /**
   * Subscribe to a registered node (for real-time monitoring)
   */
  async subscribeRegisteredNode(registeredId, interval = 1000) {
    try {
      if (!this.isConnected || !this.session) {
        throw new Error('Not connected to PLC');
      }

      const nodeInfo = this.registeredNodes.get(registeredId);
      if (!nodeInfo) {
        throw new Error('Registered node not found');
      }

      logger.info(`Subscribing to registered node: ${registeredId}, interval: ${interval}ms`);

      const subscription = await this.session.createSubscription2({
        requestedPublishingInterval: interval,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
      });

      const monitoredItem = await subscription.monitor(
        {
          nodeId: registeredId, // Use registered node ID for better performance
          attributeId: AttributeIds.Value
        },
        {
          samplingInterval: interval,
          discardOldest: true,
          queueSize: 10
        },
        MonitoringMode.Reporting
      );

      const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.subscriptions.set(subscriptionId, {
        subscription,
        monitoredItem,
        nodeId: registeredId,
        originalNodeId: nodeInfo.originalNodeId,
        isRegistered: true
      });

      // Handle data changes
      monitoredItem.on('changed', (dataValue) => {
        logger.info(`Value changed for registered node ${registeredId}:`, {
          value: dataValue.value.value,
          timestamp: dataValue.serverTimestamp
        });
        // Store latest value for polling
        this.subscriptions.get(subscriptionId).latestValue = {
          value: dataValue.value.value,
          dataType: DataType[dataValue.value.dataType],
          timestamp: dataValue.serverTimestamp || new Date().toISOString()
        };
      });

      logger.info(`Subscription created: ${subscriptionId}`);

      return {
        success: true,
        subscriptionId: subscriptionId,
        message: 'Subscription created successfully'
      };
    } catch (error) {
      logger.error('Subscribe registered node error:', error);
      throw error;
    }
  }

  /**
   * Get latest value from subscription
   */
  getSubscriptionValue(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return { success: false, error: 'Subscription not found' };
    }
    return {
      success: true,
      value: sub.latestValue || null
    };
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      endpoint: this.connectionConfig?.endpoint || null,
      sessionActive: this.session !== null
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      // Unregister all nodes
      if (this.session && this.registeredNodes.size > 0) {
        try {
          const nodeIds = Array.from(this.registeredNodes.keys());
          await this.session.unregisterNodes(nodeIds);
          logger.info('All registered nodes unregistered');
        } catch (err) {
          logger.error('Error unregistering nodes:', err);
        }
      }
      this.registeredNodes.clear();

      // Terminate all subscriptions
      for (const [id, sub] of this.subscriptions) {
        try {
          await sub.subscription.terminate();
        } catch (err) {
          logger.error(`Error terminating subscription ${id}:`, err);
        }
      }
      this.subscriptions.clear();

      // Close session
      if (this.session) {
        await this.session.close();
        this.session = null;
      }

      // Disconnect client
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }

      this.isConnected = false;
      this.connectionConfig = null;
    } catch (error) {
      logger.error('Cleanup error:', error);
      // Force reset even if cleanup fails
      this.client = null;
      this.session = null;
      this.isConnected = false;
      this.connectionConfig = null;
      this.registeredNodes.clear();
    }
  }
}

// Singleton instance
const opcuaClient = new OPCUAClientManager();

module.exports = opcuaClient;