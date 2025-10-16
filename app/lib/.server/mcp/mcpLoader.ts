import type { Tool } from 'ai';
import { MCPManager } from './mcpClient';
import { HTTPMCPClient } from './httpMcpClient';
import { createScopedLogger } from 'chef-agent/utils/logger';

const logger = createScopedLogger('mcpLoader');

interface MCPServerConfig {
  name: string;
  description?: string;
  transport: 'stdio' | 'http';
  // For stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // For HTTP
  url?: string;
  headers?: Record<string, string>;
}

// Global MCP manager instance (reused across requests)
let globalMCPManager: MCPManager | null = null;
let globalHTTPClients: Map<string, HTTPMCPClient> = new Map();
let currentServerConfigs: string = '';

/**
 * Load MCP tools from configured servers
 * 
 * Note: For stdio transport, this requires a persistent Node.js process and works in:
 * - Local development with `npm run dev`
 * - Self-hosted deployments
 * - Docker containers
 * 
 * For HTTP transport, this works everywhere including serverless environments.
 */
export async function loadMCPTools(servers: MCPServerConfig[]): Promise<Record<string, Tool>> {
  // Check if we're in a serverless environment
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || 
                       process.env.VERCEL || 
                       process.env.NETLIFY;
  
  // Separate servers by transport type
  const stdioServers = servers.filter(s => s.transport === 'stdio');
  const httpServers = servers.filter(s => s.transport === 'http');
  
  const allTools: Record<string, Tool> = {};
  
  try {
    // Handle stdio servers (only if not in serverless)
    if (stdioServers.length > 0) {
      if (isServerless) {
        logger.warn('Skipping stdio MCP servers in serverless environment. ' +
                    'Use HTTP transport for serverless deployments.');
      } else {
        const configHash = JSON.stringify(stdioServers.map(s => ({
          name: s.name,
          command: s.command,
          args: s.args,
          env: s.env,
        })));
        
        // If configs have changed, restart the manager
        if (configHash !== currentServerConfigs) {
          if (globalMCPManager) {
            logger.info('Stdio MCP server configs changed, restarting manager');
            await globalMCPManager.stopAll();
          }
          
          globalMCPManager = new MCPManager();
          
          // Start all stdio servers
          for (const server of stdioServers) {
            if (!server.command) continue;
            logger.info(`Starting stdio MCP server: ${server.name}`);
            await globalMCPManager.addServer({
              name: server.name,
              description: server.description,
              command: server.command,
              args: server.args || [],
              env: server.env,
            });
          }
          
          currentServerConfigs = configHash;
        }
        
        // Get tools from stdio servers
        const stdioTools = globalMCPManager?.getAllTools() || {};
        Object.assign(allTools, stdioTools);
      }
    }
    
    // Handle HTTP servers (works in all environments)
    if (httpServers.length > 0) {
      logger.info(`Initializing ${httpServers.length} HTTP MCP server(s)`);
      
      for (const server of httpServers) {
        if (!server.url) continue;
        
        try {
          // Check if we already have this client
          let client = globalHTTPClients.get(server.name);
          
          if (!client) {
            client = new HTTPMCPClient({
              name: server.name,
              description: server.description,
              url: server.url,
              headers: server.headers,
            });
            
            await client.start();
            globalHTTPClients.set(server.name, client);
          }
          
          const httpTools = client.getTools();
          Object.assign(allTools, httpTools);
          
          logger.info(`Loaded ${Object.keys(httpTools).length} tools from HTTP server ${server.name}`);
        } catch (error) {
          logger.error(`Failed to load HTTP MCP server ${server.name}:`, error);
          // Continue with other servers
        }
      }
    }
    
    logger.info(`Loaded ${Object.keys(allTools).length} total MCP tools`);
    
    return allTools;
  } catch (error) {
    logger.error('Failed to load MCP tools:', error);
    return {};
  }
}

/**
 * Cleanup function to stop all MCP servers
 * Should be called on process exit
 */
export async function cleanupMCPServers(): Promise<void> {
  if (globalMCPManager) {
    logger.info('Cleaning up stdio MCP servers');
    await globalMCPManager.stopAll();
    globalMCPManager = null;
    currentServerConfigs = '';
  }
  
  if (globalHTTPClients.size > 0) {
    logger.info('Cleaning up HTTP MCP clients');
    for (const [name, client] of globalHTTPClients) {
      await client.stop();
    }
    globalHTTPClients.clear();
  }
}

// Register cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    if (globalMCPManager) {
      // Synchronous cleanup
      logger.info('Process exiting, stopping MCP servers');
    }
  });
  
  process.on('SIGINT', async () => {
    await cleanupMCPServers();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await cleanupMCPServers();
    process.exit(0);
  });
}

