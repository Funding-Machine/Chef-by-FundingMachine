import type { Tool } from 'ai';
import { z } from 'zod';
import { createScopedLogger } from 'chef-agent/utils/logger';

const logger = createScopedLogger('httpMcpClient');

interface HTTPMCPServerConfig {
  name: string;
  description?: string;
  url: string;
  headers?: Record<string, string>;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * HTTP MCP Client for communicating with remote Model Context Protocol servers
 */
export class HTTPMCPClient {
  private messageId = 0;
  private tools: MCPTool[] = [];
  private initialized = false;
  
  constructor(private config: HTTPMCPServerConfig) {}
  
  /**
   * Initialize the connection with the remote MCP server
   */
  async start(): Promise<void> {
    if (this.initialized) {
      logger.warn(`HTTP MCP server ${this.config.name} already initialized`);
      return;
    }
    
    logger.info(`Initializing HTTP MCP server: ${this.config.name} at ${this.config.url}`);
    
    try {
      // Initialize the server
      await this.initialize();
      
      // Fetch available tools
      await this.fetchTools();
      
      this.initialized = true;
      logger.info(`HTTP MCP server ${this.config.name} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize HTTP MCP server ${this.config.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Stop the connection (cleanup)
   */
  async stop(): Promise<void> {
    logger.info(`Stopping HTTP MCP server: ${this.config.name}`);
    this.initialized = false;
    this.tools = [];
  }
  
  /**
   * Initialize the MCP server connection
   */
  private async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: true,
        },
        sampling: {},
      },
      clientInfo: {
        name: 'chef',
        version: '1.0.0',
      },
    });
    
    logger.info(`HTTP MCP server ${this.config.name} initialized:`, response);
    
    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});
  }
  
  /**
   * Fetch the list of available tools from the server
   */
  private async fetchTools(): Promise<void> {
    const response = await this.sendRequest('tools/list', {}) as { tools?: MCPTool[] };
    
    if (response && response.tools) {
      this.tools = response.tools;
      logger.info(`HTTP MCP server ${this.config.name} has ${this.tools.length} tools:`, 
        this.tools.map(t => t.name).join(', '));
    }
  }
  
  /**
   * Get the tools provided by this MCP server, formatted for the AI SDK
   */
  getTools(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};
    
    for (const mcpTool of this.tools) {
      // Convert MCP tool schema to Zod schema
      const zodSchema = this.convertJsonSchemaToZod(mcpTool.inputSchema);
      
      tools[`mcp_${this.config.name}_${mcpTool.name}`] = {
        description: mcpTool.description || mcpTool.name,
        parameters: zodSchema,
        execute: async (args: Record<string, unknown>) => {
          return await this.callTool(mcpTool.name, args);
        },
      };
    }
    
    return tools;
  }
  
  /**
   * Call a tool on the MCP server
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    logger.info(`Calling HTTP MCP tool ${this.config.name}.${toolName} with args:`, args);
    
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
    
    return response;
  }
  
  /**
   * Convert JSON Schema to Zod schema
   */
  private convertJsonSchemaToZod(schema: MCPTool['inputSchema']): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const prop = value as { type?: string; description?: string };
        let zodType: z.ZodTypeAny;
        
        switch (prop.type) {
          case 'string':
            zodType = z.string();
            break;
          case 'number':
            zodType = z.number();
            break;
          case 'boolean':
            zodType = z.boolean();
            break;
          case 'array':
            zodType = z.array(z.any());
            break;
          case 'object':
            zodType = z.record(z.any());
            break;
          default:
            zodType = z.any();
        }
        
        // Add description if available
        if (prop.description) {
          zodType = zodType.describe(prop.description);
        }
        
        // Make optional if not required
        if (!schema.required?.includes(key)) {
          zodType = zodType.optional();
        }
        
        shape[key] = zodType;
      }
    }
    
    return z.object(shape);
  }
  
  /**
   * Send a JSON-RPC request to the MCP server via HTTP POST
   */
  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(message),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: MCPMessage = await response.json();
      
      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message}`);
      }
      
      return data.result;
    } catch (error) {
      logger.error(`HTTP request to ${this.config.name} failed:`, error);
      throw error;
    }
  }
  
  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async sendNotification(method: string, params: unknown): Promise<void> {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    
    try {
      await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      logger.error(`HTTP notification to ${this.config.name} failed:`, error);
      // Don't throw for notifications
    }
  }
}

