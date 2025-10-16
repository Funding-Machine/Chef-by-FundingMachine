import { useConvex, useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { Button } from '@ui/Button';
import { TextInput } from '@ui/TextInput';
import { captureException } from '@sentry/remix';
import { Spinner } from '@ui/Spinner';
import type { Id } from '@convex/_generated/dataModel';

interface MCPServer {
  _id: Id<'mcpServers'>;
  _creationTime: number;
  memberId: Id<'convexMembers'>;
  name: string;
  description?: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export function McpServersCard() {
  const convex = useConvex();
  const mcpServers = useQuery(api.mcpServers.list);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<'mcpServers'> | null>(null);
  
  const handleAddServer = () => {
    setIsAdding(true);
    setEditingId(null);
  };
  
  const handleEditServer = (serverId: Id<'mcpServers'>) => {
    setEditingId(serverId);
    setIsAdding(false);
  };
  
  const handleCancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
  };
  
  // Handle loading state
  if (mcpServers === undefined) {
    return (
      <div className="rounded-lg border bg-bolt-elements-background-depth-1 shadow-sm">
        <div className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-content-primary">MCP Servers</h2>
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        </div>
      </div>
    );
  }
  
  // Handle error state (null means unauthorized or error)
  if (mcpServers === null) {
    return (
      <div className="rounded-lg border bg-bolt-elements-background-depth-1 shadow-sm">
        <div className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-content-primary">MCP Servers</h2>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Please sign in to manage MCP servers.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-lg border bg-bolt-elements-background-depth-1 shadow-sm">
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-content-primary">MCP Servers</h2>
            <p className="mt-1 text-sm text-content-secondary">
              Add custom Model Context Protocol servers to extend chat capabilities
            </p>
          </div>
          {!isAdding && !editingId && (
            <Button onClick={handleAddServer} variant="primary" size="sm">
              <PlusIcon className="mr-2" />
              Add Server
            </Button>
          )}
        </div>
        
        {(isAdding || editingId) && (
          <MCPServerForm
            serverId={editingId}
            server={editingId ? mcpServers.find(s => s._id === editingId) : undefined}
            onCancel={handleCancelEdit}
            onSave={handleCancelEdit}
          />
        )}
        
        {!isAdding && !editingId && (
          <div className="space-y-3">
            {mcpServers.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-content-secondary">
                  No MCP servers configured yet. Add one to get started.
                </p>
              </div>
            ) : (
              mcpServers.map((server) => (
                <MCPServerItem
                  key={server._id}
                  server={server}
                  onEdit={() => handleEditServer(server._id)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface MCPServerItemProps {
  server: MCPServer;
  onEdit: () => void;
}

function MCPServerItem({ server, onEdit }: MCPServerItemProps) {
  const convex = useConvex();
  const toggleEnabled = useMutation(api.mcpServers.toggleEnabled);
  const removeServer = useMutation(api.mcpServers.remove);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  
  const handleToggle = async () => {
    try {
      setIsToggling(true);
      await toggleEnabled({ serverId: server._id });
      toast.success(server.enabled ? 'Server disabled' : 'Server enabled');
    } catch (error) {
      captureException(error);
      toast.error('Failed to toggle server');
    } finally {
      setIsToggling(false);
    }
  };
  
  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${server.name}"?`)) {
      return;
    }
    
    try {
      setIsDeleting(true);
      await removeServer({ serverId: server._id });
      toast.success('Server deleted');
    } catch (error) {
      captureException(error);
      toast.error('Failed to delete server');
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <div className="rounded-lg border bg-bolt-elements-background-depth-2 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-content-primary">{server.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                server.enabled
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {server.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {server.description && (
            <p className="mt-1 text-sm text-content-secondary">{server.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-content-tertiary">
            <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 font-medium uppercase">
              {server.transport}
            </span>
            <code className="rounded bg-bolt-elements-background-depth-3 px-1 py-0.5">
              {server.transport === 'stdio' 
                ? `${server.command} ${server.args?.join(' ') || ''}`
                : server.url}
            </code>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleToggle}
            disabled={isToggling || isDeleting}
            variant="neutral"
            size="sm"
          >
            {isToggling ? <Spinner size="sm" /> : server.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button
            onClick={onEdit}
            disabled={isDeleting}
            variant="neutral"
            size="sm"
            title="Edit"
          >
            <Pencil1Icon />
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            variant="danger"
            size="sm"
            title="Delete"
          >
            {isDeleting ? <Spinner size="sm" /> : <TrashIcon />}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MCPServerFormProps {
  serverId?: Id<'mcpServers'> | null;
  server?: MCPServer;
  onCancel: () => void;
  onSave: () => void;
}

function MCPServerForm({ serverId, server, onCancel, onSave }: MCPServerFormProps) {
  const convex = useConvex();
  const addServer = useMutation(api.mcpServers.add);
  const updateServer = useMutation(api.mcpServers.update);
  
  const [name, setName] = useState(server?.name || '');
  const [description, setDescription] = useState(server?.description || '');
  const [transport, setTransport] = useState<'stdio' | 'http'>(server?.transport || 'stdio');
  const [command, setCommand] = useState(server?.command || 'npx');
  const [argsText, setArgsText] = useState(server?.args?.join(' ') || '');
  const [envText, setEnvText] = useState(
    server?.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  );
  const [url, setUrl] = useState(server?.url || '');
  const [headersText, setHeadersText] = useState(
    server?.headers ? Object.entries(server.headers).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  );
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Please enter a server name');
      return;
    }
    
    if (transport === 'stdio' && !command.trim()) {
      toast.error('Please enter a command for stdio transport');
      return;
    }
    
    if (transport === 'http' && !url.trim()) {
      toast.error('Please enter a URL for HTTP transport');
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Parse args (for stdio)
      let args: string[] | undefined;
      if (transport === 'stdio' && argsText.trim()) {
        args = argsText
          .split(/\s+/)
          .filter(arg => arg.trim())
          .map(arg => arg.trim());
      }
      
      // Parse env (for stdio)
      let env: Record<string, string> | undefined;
      if (transport === 'stdio' && envText.trim()) {
        env = {};
        for (const line of envText.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
      
      // Parse headers (for HTTP)
      let headers: Record<string, string> | undefined;
      if (transport === 'http' && headersText.trim()) {
        headers = {};
        for (const line of headersText.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            headers[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
      
      const serverData = {
        name: name.trim(),
        description: description.trim() || undefined,
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args,
        env,
        url: transport === 'http' ? url.trim() : undefined,
        headers,
        enabled,
      };
      
      if (serverId && server) {
        await updateServer({
          serverId,
          updates: serverData,
        });
        toast.success('Server updated');
      } else {
        await addServer(serverData);
        toast.success('Server added');
      }
      
      onSave();
    } catch (error) {
      captureException(error);
      toast.error(error instanceof Error ? error.message : 'Failed to save server');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="mb-4 space-y-4 rounded-lg border bg-bolt-elements-background-depth-2 p-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-content-primary">
          Server Name *
        </label>
        <TextInput
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="filesystem-server"
          required
        />
      </div>
      
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-content-primary">
          Description
        </label>
        <TextInput
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Provides access to the local filesystem"
        />
      </div>
      
      <div>
        <label htmlFor="transport" className="mb-1 block text-sm font-medium text-content-primary">
          Transport Type *
        </label>
        <select
          id="transport"
          value={transport}
          onChange={(e) => setTransport(e.target.value as 'stdio' | 'http')}
          className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
          required
        >
          <option value="stdio">Stdio (Local Process)</option>
          <option value="http">HTTP (Remote Server)</option>
        </select>
        <p className="mt-1 text-xs text-content-tertiary">
          Stdio for local servers, HTTP for remote/serverless environments
        </p>
      </div>
      
      {transport === 'stdio' ? (
        <>
          <div>
            <label htmlFor="command" className="mb-1 block text-sm font-medium text-content-primary">
              Command *
            </label>
            <TextInput
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              required
            />
            <p className="mt-1 text-xs text-content-tertiary">
              The command to run the MCP server (e.g., npx, node, python)
            </p>
          </div>
          
          <div>
            <label htmlFor="args" className="mb-1 block text-sm font-medium text-content-primary">
              Arguments
            </label>
            <TextInput
              id="args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-filesystem /path/to/allowed/files"
            />
            <p className="mt-1 text-xs text-content-tertiary">
              Space-separated arguments for the command
            </p>
          </div>
          
          <div>
            <label htmlFor="env" className="mb-1 block text-sm font-medium text-content-primary">
              Environment Variables
            </label>
            <textarea
              id="env"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="API_KEY=your-key&#10;DEBUG=true"
              rows={3}
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
            <p className="mt-1 text-xs text-content-tertiary">
              One per line in KEY=value format
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="url" className="mb-1 block text-sm font-medium text-content-primary">
              Server URL *
            </label>
            <TextInput
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com"
              required
            />
            <p className="mt-1 text-xs text-content-tertiary">
              The HTTP endpoint of your MCP server
            </p>
          </div>
          
          <div>
            <label htmlFor="headers" className="mb-1 block text-sm font-medium text-content-primary">
              HTTP Headers
            </label>
            <textarea
              id="headers"
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder="Authorization=Bearer token&#10;X-API-Key=your-key"
              rows={3}
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
            <p className="mt-1 text-xs text-content-tertiary">
              One per line in KEY=value format (optional)
            </p>
          </div>
        </>
      )}
      
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-bolt-elements-borderColor"
        />
        <label htmlFor="enabled" className="text-sm text-content-primary">
          Enable server
        </label>
      </div>
      
      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving} variant="primary">
          {isSaving ? <Spinner size="sm" /> : serverId ? 'Update Server' : 'Add Server'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={isSaving} variant="neutral">
          Cancel
        </Button>
      </div>
    </form>
  );
}

