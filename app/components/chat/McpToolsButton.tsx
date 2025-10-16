import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Menu as MenuComponent, MenuItem as MenuItemComponent } from '@ui/Menu';
import { Tooltip } from '@ui/Tooltip';
import { 
  CubeTransparentIcon, 
  InformationCircleIcon,
  Cog6ToothIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@radix-ui/react-icons';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import { captureException } from '@sentry/remix';
import { Sheet } from '@ui/Sheet';
import { Button } from '@ui/Button';
import { TextInput } from '@ui/TextInput';

export function McpToolsButton() {
  const mcpServers = useQuery(api.mcpServers.list);
  const toggleEnabled = useMutation(api.mcpServers.toggleEnabled);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const handleToggleServer = async (serverId: Id<'mcpServers'>) => {
    try {
      await toggleEnabled({ serverId });
      toast.success('MCP server toggled');
    } catch (error) {
      captureException(error);
      toast.error('Failed to toggle server');
    }
  };
  
  // Handle unauthenticated state
  if (mcpServers === null) {
    return null; // Don't show button if not authenticated
  }
  
  const enabledCount = mcpServers?.filter(s => s.enabled).length || 0;
  
  return (
    <>
      <MenuComponent
        buttonProps={{
          variant: 'neutral',
          tip: 'MCP Tools',
          inline: true,
          icon: (
            <div className="relative">
              <CubeTransparentIcon className="size-4" />
              {enabledCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 text-[8px] font-bold text-white">
                  {enabledCount}
                </span>
              )}
            </div>
          ),
        }}
        placement="top-start"
      >
        <div className="ml-3 flex items-center gap-1">
          <h2 className="text-sm font-bold">MCP Tools</h2>
          <Tooltip tip="Model Context Protocol servers provide custom tools and capabilities." side="top">
            <span className="cursor-help text-content-tertiary">
              <InformationCircleIcon className="size-4" />
            </span>
          </Tooltip>
        </div>
        
        {!mcpServers || mcpServers.length === 0 ? (
          <>
            <div className="px-3 py-2 text-xs text-content-secondary">
              No MCP servers configured yet.
            </div>
            <MenuItemComponent action={() => setIsAddDialogOpen(true)}>
              <div className="flex w-full items-center gap-2">
                <PlusIcon className="size-4 text-content-secondary" />
                Add MCP Server
              </div>
            </MenuItemComponent>
          </>
        ) : (
          <>
            {mcpServers.map((server) => (
              <MenuItemComponent 
                key={server._id} 
                action={() => handleToggleServer(server._id)}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CubeTransparentIcon className="size-4 text-content-secondary" />
                    <div className="flex flex-col">
                      <span className="text-sm">{server.name}</span>
                      {server.description && (
                        <span className="text-xs text-content-tertiary">
                          {server.description}
                        </span>
                      )}
                    </div>
                  </div>
                  {server.enabled && (
                    <CheckIcon className="size-4 text-green-500" />
                  )}
                </div>
              </MenuItemComponent>
            ))}
            <hr className="my-1" />
            <MenuItemComponent action={() => setIsAddDialogOpen(true)}>
              <div className="flex w-full items-center gap-2">
                <PlusIcon className="size-4 text-content-secondary" />
                Add Server
              </div>
            </MenuItemComponent>
          </>
        )}
        
        <hr className="my-1" />
        <MenuItemComponent action={() => window.location.pathname = '/settings'}>
          <div className="flex w-full items-center gap-2">
            <Cog6ToothIcon className="size-4 text-content-secondary" />
            Manage in Settings
          </div>
        </MenuItemComponent>
      </MenuComponent>
      
      {isAddDialogOpen && (
        <QuickAddMcpServerDialog
          onClose={() => setIsAddDialogOpen(false)}
        />
      )}
    </>
  );
}

interface QuickAddMcpServerDialogProps {
  onClose: () => void;
}

function QuickAddMcpServerDialog({ onClose }: QuickAddMcpServerDialogProps) {
  const addServer = useMutation(api.mcpServers.add);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Please enter a server name');
      return;
    }
    
    if (transport === 'stdio' && !args.trim()) {
      toast.error('Please enter arguments for stdio transport');
      return;
    }
    
    if (transport === 'http' && !url.trim()) {
      toast.error('Please enter a URL for HTTP transport');
      return;
    }
    
    try {
      setIsSaving(true);
      
      let argsList: string[] | undefined;
      if (transport === 'stdio' && args.trim()) {
        argsList = args
          .split(/\s+/)
          .filter(arg => arg.trim())
          .map(arg => arg.trim());
      }
      
      await addServer({
        name: name.trim(),
        description: description.trim() || undefined,
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: argsList,
        env: undefined,
        url: transport === 'http' ? url.trim() : undefined,
        headers: undefined,
        enabled: true,
      });
      
      toast.success('MCP server added');
      onClose();
    } catch (error) {
      captureException(error);
      toast.error(error instanceof Error ? error.message : 'Failed to add server');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Sheet isOpen={true} onClose={onClose}>
      <div className="flex h-full flex-col">
        <div className="border-b p-4">
          <h2 className="text-xl font-semibold text-content-primary">Quick Add MCP Server</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Add a Model Context Protocol server to extend Chef's capabilities
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <label htmlFor="quick-name" className="mb-1 block text-sm font-medium text-content-primary">
                Server Name *
              </label>
              <TextInput
                id="quick-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="filesystem"
                required
                autoFocus
              />
            </div>
            
            <div>
              <label htmlFor="quick-description" className="mb-1 block text-sm font-medium text-content-primary">
                Description
              </label>
              <TextInput
                id="quick-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provides access to the local filesystem"
              />
            </div>
            
            <div>
              <label htmlFor="quick-transport" className="mb-1 block text-sm font-medium text-content-primary">
                Transport Type *
              </label>
              <select
                id="quick-transport"
                value={transport}
                onChange={(e) => setTransport(e.target.value as 'stdio' | 'http')}
                className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
                required
              >
                <option value="stdio">Stdio (Local Process)</option>
                <option value="http">HTTP (Remote Server)</option>
              </select>
              <p className="mt-1 text-xs text-content-tertiary">
                Stdio for local, HTTP for remote/serverless
              </p>
            </div>
            
            {transport === 'stdio' ? (
              <>
                <div>
                  <label htmlFor="quick-command" className="mb-1 block text-sm font-medium text-content-primary">
                    Command *
                  </label>
                  <TextInput
                    id="quick-command"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="quick-args" className="mb-1 block text-sm font-medium text-content-primary">
                    Arguments *
                  </label>
                  <TextInput
                    id="quick-args"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-filesystem /path/to/files"
                    required
                  />
                  <p className="mt-1 text-xs text-content-tertiary">
                    Space-separated arguments
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="quick-url" className="mb-1 block text-sm font-medium text-content-primary">
                  Server URL *
                </label>
                <TextInput
                  id="quick-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mcp.example.com"
                  required
                />
                <p className="mt-1 text-xs text-content-tertiary">
                  The HTTP endpoint of your MCP server
                </p>
              </div>
            )}
            
            <div className="rounded-lg border bg-bolt-elements-background-depth-2 p-3">
              <p className="text-xs text-content-secondary">
                <strong>Note:</strong> {transport === 'stdio' 
                  ? 'Stdio servers work in local development. For production/serverless, use HTTP transport.'
                  : 'HTTP servers work everywhere including serverless environments.'
                } For advanced config, use Settings.
              </p>
            </div>
          </div>
        </form>
        
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={isSaving}
              variant="primary"
              className="flex-1"
            >
              {isSaving ? 'Adding...' : 'Add Server'}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              variant="neutral"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

