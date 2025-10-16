import { stripIndents } from '../utils/stripIndent.js';

export function mcpGuidelines(hasMcpServers: boolean) {
  if (!hasMcpServers) {
    return '';
  }
  
  return stripIndents`
  <mcp_servers>
    The user has configured custom MCP (Model Context Protocol) servers that provide
    additional tools and capabilities. These tools are available alongside the standard
    Chef tools.

    MCP tools are prefixed with \`mcp_<servername>_\` to indicate which server provides them.
    Use these tools naturally when they're relevant to the user's request.

    For example:
    - If a filesystem MCP server is configured, you can use it to read/write files outside
      the project directory
    - If a database MCP server is configured, you can use it to query databases
    - If a web search MCP server is configured, you can use it to search the web

    Treat MCP tools the same way you treat built-in tools - use them when they're the best
    solution for the task at hand.
  </mcp_servers>
  `;
}

