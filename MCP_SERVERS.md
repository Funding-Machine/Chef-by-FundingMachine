# MCP Servers in Chef

Chef now supports Model Context Protocol (MCP) servers, allowing you to extend the capabilities of the AI assistant with custom tools and data sources.

## What is MCP?

The Model Context Protocol (MCP) is an open protocol that standardizes how applications provide context to Large Language Models (LLMs). MCP servers expose tools, resources, and prompts that can be used by AI assistants.

## Features

- **Configure MCP Servers**: Add and manage MCP servers through the Settings page
- **Custom Tools**: MCP servers can provide custom tools that extend Chef's capabilities
- **Multiple Servers**: Configure multiple MCP servers to access different services
- **Enable/Disable**: Toggle servers on and off without removing them

## Setting Up MCP Servers

### 1. Access Settings

Navigate to Settings (click your profile icon → Settings & Usage) and scroll to the "MCP Servers" section.

### 2. Add a Server

Click "Add Server" and provide:
- **Server Name**: A unique identifier for the server
- **Description**: Optional description of what the server does
- **Command**: The command to run (e.g., `npx`, `node`, `python`)
- **Arguments**: Space-separated arguments (e.g., `-y @modelcontextprotocol/server-filesystem /allowed/path`)
- **Environment Variables**: Optional KEY=value pairs, one per line
- **Enabled**: Whether the server should be active

### 3. Transport Types

Chef supports two transport types for MCP servers:

**Stdio (Standard Input/Output)**
- Runs MCP server as a local process
- Best for local development
- Requires persistent Node.js process
- Not available in serverless environments

**HTTP**
- Connects to remote MCP server via HTTP
- Works everywhere including serverless
- Ideal for production deployments
- Supports authentication headers

### 4. Example Configurations

#### Stdio: Filesystem Server
```
Name: filesystem
Description: Access to local filesystem
Transport: Stdio
Command: npx
Arguments: -y @modelcontextprotocol/server-filesystem /Users/username/projects
```

#### Stdio: Database Server
```
Name: postgres
Description: PostgreSQL database access
Transport: Stdio
Command: npx
Arguments: -y @modelcontextprotocol/server-postgres
Environment Variables:
DATABASE_URL=postgresql://localhost:5432/mydb
```

#### HTTP: Remote MCP Server
```
Name: remote-server
Description: Remote MCP server
Transport: HTTP
URL: https://mcp.example.com
Headers:
Authorization=Bearer your-token
X-API-Key=your-api-key
```

#### HTTP: Self-Hosted Server
```
Name: my-mcp-server
Description: Self-hosted MCP server
Transport: HTTP
URL: https://my-mcp.company.com/api
```

## Important Notes

### Transport Comparison

| Feature | Stdio | HTTP |
|---------|-------|------|
| **Environment** | Local processes only | Works everywhere |
| **Serverless** | ❌ Not supported | ✅ Fully supported |
| **Setup** | Easy (run command) | Requires server deployment |
| **Authentication** | Via env vars | Via HTTP headers |
| **Best For** | Development | Production |

### Stdio Transport

Stdio servers run as persistent processes and require a long-running Node.js environment:

**✅ Works in:**
- Local development (`npm run dev`)
- Self-hosted deployments
- Docker containers
- VPS/dedicated servers

**❌ Does NOT work in:**
- Vercel (serverless)
- AWS Lambda (serverless)
- Netlify Functions (serverless)

### HTTP Transport

HTTP servers work in **all environments** including serverless:

**✅ Always works:**
- Local development
- Production deployments
- Serverless (Vercel, Lambda, etc.)
- Any environment with HTTP access

**Requirements:**
- MCP server must be deployed separately
- Server must expose HTTP endpoint
- Optional: Authentication headers

### Security Considerations

- Only add MCP servers from trusted sources
- Be careful with filesystem and database access
- Review server permissions and capabilities
- Use environment variables for sensitive data
- Never commit API keys or secrets

## Available MCP Servers

Explore available MCP servers:
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers)
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers)

## Using MCP Tools

Once configured and enabled, MCP tools become available to the AI assistant automatically. The assistant will use them when appropriate for the task at hand.

MCP tools are prefixed with `mcp_<servername>_` to identify which server provides them.

### Example: Using Context7 for Documentation

```
Name: context7
Description: Access to developer documentation
Transport: HTTP
URL: https://context7.example.com/mcp
Headers:
Authorization=Bearer your-context7-token
```

Then in chat, you can ask:
> "Use context7 MCP to get the docs for Zoho CRM to ensure you are using the API correctly"

The AI will automatically use the `mcp_context7_search` tool to fetch relevant documentation.

## Troubleshooting

### Server Not Starting (Stdio)
- Check command and arguments are correct
- Verify the MCP server package is installed
- Check environment variables are properly formatted
- Look at server logs in the terminal
- Confirm you're not in a serverless environment

### HTTP Connection Issues
- Verify the URL is correct and accessible
- Check if server requires authentication headers
- Ensure the server implements MCP over HTTP
- Test the endpoint with curl or Postman first
- Check CORS settings if applicable

### Tools Not Available
- Ensure the server is enabled (check the green checkmark)
- For stdio: Verify you're in local development
- For HTTP: Check network connectivity
- Look at browser console for error messages
- Try toggling the server off and on

### Authentication Errors
- For stdio: Check environment variables are set correctly
- For HTTP: Verify headers are in correct format (KEY=value)
- Ensure API keys/tokens are valid
- Check authorization header format (e.g., "Bearer token")

### "I don't have access to the X MCP tool" Error
- Verify the server is enabled (toggle it in the MCP Tools menu)
- Check that the server successfully started (look for logs)
- Try refreshing the page
- For HTTP servers, ensure the URL is reachable

## Development

To test MCP servers locally:

1. Run Chef in development mode: `npm run dev`
2. Configure your MCP server in Settings
3. Enable the server
4. Start a new chat and test the functionality

## Further Reading

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Building MCP Servers](https://modelcontextprotocol.io/docs/building-servers)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

