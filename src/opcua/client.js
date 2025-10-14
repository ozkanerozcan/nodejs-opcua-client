const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
  AttributeIds,
  ClientSession,
  DataType,
  MonitoringMode,
  NodeClass,
  BrowseDirection,
  makeNodeId,
  resolveNodeId
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

      // Set up session error handlers
      this.session.on('session_closed', (statusCode) => {
        logger.warn('Session closed:', statusCode);
        this.isConnected = false;
        this.handleConnectionLost('Session was closed by server');
      });

      this.session.on('keepalive', () => {
        logger.debug('Keep-alive received');
      });

      this.session.on('keepalive_failure', () => {
        logger.error('Keep-alive failure detected');
        this.isConnected = false;
        this.handleConnectionLost('Keep-alive failure - connection lost');
      });

      // Set up client error handlers
      this.client.on('connection_lost', () => {
        logger.error('Connection lost');
        this.isConnected = false;
        this.handleConnectionLost('Connection to PLC lost');
      });

      this.client.on('backoff', (retry, delay) => {
        logger.warn(`Connection backoff: retry ${retry}, delay ${delay}ms`);
      });

      this.isConnected = true;
      this.connectionConfig = config;

      return {
        success: true,
        message: 'Connected to PLC successfully',
        endpoint: endpoint
      };
    } catch (error) {
      logger.error('Connection error:', error);
      
      // Enhanced error messages
      let errorMessage = error.message;
      if (error.message.includes('keep') || error.message.includes('KeepAlive')) {
        errorMessage = `Keep-alive error: ${error.message}. Consider increasing Keep Alive Interval in settings.`;
        logger.error('Keep-alive configuration issue detected');
      } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        errorMessage = `Connection timeout: ${error.message}. Check network and increase timeout settings.`;
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused: OPC UA server is not running or endpoint is incorrect.';
      }
      
      await this.cleanup();
      throw new Error(errorMessage);
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
      
      // If read fails due to connection issue, mark as disconnected
      if (error.message.includes('BadSessionClosed') || 
          error.message.includes('BadConnectionClosed') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT')) {
        this.isConnected = false;
        this.handleConnectionLost('Read operation failed - connection lost');
      }
      
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

      logger.info(`Browsing node: ${nodeId}`);

      // Use HierarchicalReferences to get all hierarchical references
      // This includes: HasComponent, HasProperty, Organizes, HasEventSource, HasNotifier, etc.
      // But excludes type definitions (HasTypeDefinition) and other non-hierarchical references
      const browseDescription = {
        nodeId: nodeId,
        browseDirection: BrowseDirection.Forward,
        referenceTypeId: resolveNodeId("HierarchicalReferences"), // Get all hierarchical references
        includeSubtypes: true, // Include all subtypes of HierarchicalReferences
        nodeClassMask: 0, // 0 means all node classes
        resultMask: 0x3F  // All attributes (BrowseName, DisplayName, NodeClass, etc.)
      };

      const browseResult = await this.session.browse(browseDescription);
      
      logger.info(`Raw browse result status: ${browseResult.statusCode.toString()}`);
      logger.info(`Raw references count: ${browseResult.references?.length || 0}`);
      
      // Helper function to convert NodeClass enum to string
      const getNodeClassName = (nodeClass) => {
        const nodeClassMap = {
          [NodeClass.Object]: 'Object',
          [NodeClass.Variable]: 'Variable',
          [NodeClass.Method]: 'Method',
          [NodeClass.ObjectType]: 'ObjectType',
          [NodeClass.VariableType]: 'VariableType',
          [NodeClass.ReferenceType]: 'ReferenceType',
          [NodeClass.DataType]: 'DataType',
          [NodeClass.View]: 'View'
        };
        return nodeClassMap[nodeClass] || 'Unknown';
      };
      
      const nodes = browseResult.references.map((ref, index) => {
        const node = {
          nodeId: ref.nodeId.toString(),
          browseName: ref.browseName.toString(),
          displayName: ref.displayName?.text || ref.browseName.toString(),
          nodeClass: getNodeClassName(ref.nodeClass),
          isForward: ref.isForward,
          referenceTypeId: ref.referenceTypeId?.toString()
        };
        
        // Log first 10 nodes for debugging
        if (index < 10) {
          logger.info(`Node ${index}: ${node.displayName} (${node.nodeClass}) - ${node.nodeId}`);
        }
        
        return node;
      });

      logger.info(`Browse result: Found ${nodes.length} nodes under ${nodeId}`);
      logger.info(`All node names: ${nodes.map(n => n.displayName).join(', ')}`);

      return {
        success: true,
        nodes: nodes
      };
    } catch (error) {
      logger.error('Browse error:', error);
      logger.error('Browse error stack:', error.stack);
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

      // Calculate lifetime and keepalive counts based on interval
      const publishingInterval = interval;
      const maxKeepAliveCount = Math.max(10, Math.ceil(10000 / publishingInterval));
      const lifetimeCount = maxKeepAliveCount * 3;

      const subscription = await this.session.createSubscription2({
        requestedPublishingInterval: publishingInterval,
        requestedLifetimeCount: lifetimeCount,
        requestedMaxKeepAliveCount: maxKeepAliveCount,
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

      // Find and terminate all subscriptions for this node
      const subscriptionsToDelete = [];
      for (const [subscriptionId, sub] of this.subscriptions) {
        if (sub.nodeId === registeredId) {
          subscriptionsToDelete.push(subscriptionId);
        }
      }

      // Terminate subscriptions
      for (const subscriptionId of subscriptionsToDelete) {
        try {
          const sub = this.subscriptions.get(subscriptionId);
          if (sub && sub.subscription) {
            await sub.subscription.terminate();
          }
          this.subscriptions.delete(subscriptionId);
          logger.info(`Terminated subscription ${subscriptionId} for node ${registeredId}`);
        } catch (subError) {
          logger.error(`Error terminating subscription ${subscriptionId}:`, subError);
        }
      }

      // Unregister from OPC UA server
      await this.session.unregisterNodes([registeredId]);
      
      // Remove from our map
      this.registeredNodes.delete(registeredId);

      logger.info(`Node unregistered: ${nodeInfo.originalNodeId}, ${subscriptionsToDelete.length} subscription(s) terminated`);

      return {
        success: true,
        message: 'Node unregistered successfully',
        terminatedSubscriptions: subscriptionsToDelete.length
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
      
      // If read fails due to connection issue, mark as disconnected
      if (error.message.includes('BadSessionClosed') || 
          error.message.includes('BadConnectionClosed') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT')) {
        this.isConnected = false;
        this.handleConnectionLost('Read registered operation failed - connection lost');
      }
      
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
   * Get all active subscriptions
   */
  getActiveSubscriptions() {
    const subs = [];
    for (const [subscriptionId, info] of this.subscriptions) {
      subs.push({
        subscriptionId: subscriptionId,
        nodeId: info.nodeId,
        originalNodeId: info.originalNodeId,
        isRegistered: info.isRegistered || false,
        latestValue: info.latestValue || null
      });
    }
    return subs;
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

      // Calculate lifetime and keepalive counts based on interval
      // lifetimeCount should be at least 3 times the maxKeepAliveCount
      // and maxKeepAliveCount should accommodate the publishing interval
      const publishingInterval = interval;
      const maxKeepAliveCount = Math.max(10, Math.ceil(10000 / publishingInterval)); // At least 10 seconds worth
      const lifetimeCount = maxKeepAliveCount * 3;

      const subscription = await this.session.createSubscription2({
        requestedPublishingInterval: publishingInterval,
        requestedLifetimeCount: lifetimeCount,
        requestedMaxKeepAliveCount: maxKeepAliveCount,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
      });

      logger.info(`Subscription created with lifetimeCount: ${lifetimeCount}, maxKeepAliveCount: ${maxKeepAliveCount}`);

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
      
      // Read initial value
      let initialValue = null;
      try {
        const dataValue = await this.session.read({
          nodeId: registeredId,
          attributeId: AttributeIds.Value
        });
        
        if (dataValue.statusCode.isGood()) {
          initialValue = {
            value: dataValue.value.value,
            dataType: DataType[dataValue.value.dataType],
            timestamp: dataValue.serverTimestamp || new Date().toISOString()
          };
        }
      } catch (readError) {
        logger.error('Failed to read initial value:', readError);
      }
      
      this.subscriptions.set(subscriptionId, {
        subscription,
        monitoredItem,
        nodeId: registeredId,
        originalNodeId: nodeInfo.originalNodeId,
        isRegistered: true,
        latestValue: initialValue
      });

      // Handle data changes
      monitoredItem.on('changed', (dataValue) => {
        const newValue = {
          value: dataValue.value.value,
          dataType: DataType[dataValue.value.dataType],
          timestamp: dataValue.serverTimestamp || new Date().toISOString()
        };
        
        logger.info(`Value changed for registered node ${registeredId}:`, newValue);
        
        // Store latest value for polling
        const sub = this.subscriptions.get(subscriptionId);
        if (sub) {
          sub.latestValue = newValue;
        }
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
   * Handle connection lost event
   */
  handleConnectionLost(reason) {
    logger.error('Connection lost:', reason);
    this.isConnected = false;
    
    // Clean up resources
    this.cleanup().catch(err => {
      logger.error('Error during connection lost cleanup:', err);
    });
    
    // You could emit an event here for real-time notification
    // or use WebSocket to notify frontend immediately
  }

  /**
   * Get connection status with real connection test
   */
  async getStatus() {
    // First check basic flags
    if (!this.isConnected || !this.session) {
      return {
        connected: false,
        endpoint: this.connectionConfig?.endpoint || null,
        sessionActive: false
      };
    }

    // Perform actual connection test by reading Server Status
    try {
      const testRead = await this.session.read({
        nodeId: 'i=2259', // Server_ServerStatus_State
        attributeId: AttributeIds.Value
      });

      if (testRead.statusCode.isGood()) {
        return {
          connected: true,
          endpoint: this.connectionConfig?.endpoint || null,
          sessionActive: true
        };
      } else {
        // If read failed, connection is lost
        logger.warn('Connection test failed:', testRead.statusCode.toString());
        this.isConnected = false;
        this.handleConnectionLost('Connection test failed');
        return {
          connected: false,
          endpoint: this.connectionConfig?.endpoint || null,
          sessionActive: false
        };
      }
    } catch (error) {
      // If any error occurs, connection is lost
      logger.error('Connection test error:', error.message);
      this.isConnected = false;
      this.handleConnectionLost('Connection test error');
      return {
        connected: false,
        endpoint: this.connectionConfig?.endpoint || null,
        sessionActive: false
      };
    }
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