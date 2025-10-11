const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
  AttributeIds,
  ClientSession,
  DataType
} = require('node-opcua');
const logger = require('../utils/logger');

class OPCUAClientManager {
  constructor() {
    this.client = null;
    this.session = null;
    this.isConnected = false;
    this.connectionConfig = null;
    this.subscriptions = new Map();
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

      // Map dataType string to DataType enum
      const dataTypeMap = {
        'Boolean': DataType.Boolean,
        'Int16': DataType.Int16,
        'Int32': DataType.Int32,
        'Float': DataType.Float,
        'Double': DataType.Double,
        'String': DataType.String
      };

      const nodeToWrite = {
        nodeId: nodeId,
        attributeId: AttributeIds.Value,
        value: {
          value: {
            dataType: dataTypeMap[dataType] || DataType.Double,
            value: value
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
        }
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
    }
  }
}

// Singleton instance
const opcuaClient = new OPCUAClientManager();

module.exports = opcuaClient;