import { spawn, type ChildProcess } from 'child_process';
import type { Tool } from 'ai';
import { z } from 'zod';
import { createScopedLogger } from 'chef-agent/utils/logger';

const logger = createScopedLogger('mcpClient');

interface MCPServerConfig {
  name: string;
  description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
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
 * MCP Client for communicating with Model Context Protocol servers
 */
export class MCPClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }>();
  private tools: MCPTool[] = [];
  private buffer = '';
  
  constructor(private config: MCPServerConfig) {}
  
  /**
   * Start the MCP server process
   */
  async start(): Promise<void> {
    if (this.process) {
      logger.warn(`MCP server ${this.config.name} already started`);
      return;
    }
    
    logger.info(`Starting MCP server: ${this.config.name}`);
    
    // Spawn the process
    this.process = spawn(this.config.command, this.config.args, {
      env: {
        ...process.env,
        ...this.config.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // Handle stdout (responses from the server)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });
    
    // Handle stderr (errors)
    this.process.stderr?.on('data', (data: Buffer) => {
      logger.error(`MCP server ${this.config.name} stderr:`, data.toString());
    });
    
    // Handle process exit
    this.process.on('exit', (code, signal) => {
      logger.info(`MCP server ${this.config.name} exited with code ${code} and signal ${signal}`);
      this.process = null;
    });
    
    // Initialize the server
    await this.initialize();
    
    // Fetch available tools
    await this.fetchTools();
  }
  
  /**
   * Stop the MCP server process
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }
    
    logger.info(`Stopping MCP server: ${this.config.name}`);
    
    this.process.kill();
    this.process = null;
    this.pendingRequests.clear();
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
    
    logger.info(`MCP server ${this.config.name} initialized:`, response);
    
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
      logger.info(`MCP server ${this.config.name} has ${this.tools.length} tools:`, 
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
    logger.info(`Calling MCP tool ${this.config.name}.${toolName} with args:`, args);
    
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
   * Send a JSON-RPC request to the MCP server
   */
  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error(`MCP server ${this.config.name} is not running`);
    }
    
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      const messageStr = JSON.stringify(message) + '\n';
      this.process?.stdin?.write(messageStr);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 30000);
    });
  }
  
  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error(`MCP server ${this.config.name} is not running`);
    }
    
    const message: MCPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    
    const messageStr = JSON.stringify(message) + '\n';
    this.process.stdin.write(messageStr);
  }
  
  /**
   * Handle incoming data from the server
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    
    // Process complete messages (separated by newlines)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      
      try {
        const message: MCPMessage = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        logger.error(`Failed to parse MCP message from ${this.config.name}:`, error, line);
      }
    }
  }
  
  /**
   * Handle a parsed message from the server
   */
  private handleMessage(message: MCPMessage): void {
    // Handle responses
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        pending?.reject(new Error(message.error.message));
      } else {
        pending?.resolve(message.result);
      }
      return;
    }
    
    // Handle notifications (methods without an id)
    if (message.method && message.id === undefined) {
      logger.info(`MCP notification from ${this.config.name}:`, message.method, message.params);
      return;
    }
    
    // Handle requests from server (not common in most MCP servers)
    if (message.method && message.id !== undefined) {
      logger.warn(`Unexpected request from MCP server ${this.config.name}:`, message.method);
      return;
    }
  }
}

/**
 * Manager for multiple MCP clients
 */
export class MCPManager {
  private clients = new Map<string, MCPClient>();
  
  /**
   * Add and start an MCP server
   */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      logger.warn(`MCP server ${config.name} already exists`);
      return;
    }
    
    const client = new MCPClient(config);
    await client.start();
    this.clients.set(config.name, client);
  }
  
  /**
   * Remove and stop an MCP server
   */
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      return;
    }
    
    await client.stop();
    this.clients.delete(name);
  }
  
  /**
   * Get all tools from all MCP servers
   */
  getAllTools(): Record<string, Tool> {
    const allTools: Record<string, Tool> = {};
    
    for (const client of this.clients.values()) {
      Object.assign(allTools, client.getTools());
    }
    
    return allTools;
  }
  
  /**
   * Stop all MCP servers
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map(client => client.stop())
    );
    this.clients.clear();
  }
}

