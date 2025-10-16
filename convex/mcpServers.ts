import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentMember } from "./sessions";

// Validator for MCP server configuration
const mcpServerValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  transport: v.union(v.literal("stdio"), v.literal("http")),
  // For stdio transport
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  env: v.optional(v.record(v.string(), v.string())),
  // For HTTP transport
  url: v.optional(v.string()),
  headers: v.optional(v.record(v.string(), v.string())),
  enabled: v.boolean(),
});

/**
 * List all MCP servers for the current user
 */
export const list = query({
  args: {},
  returns: v.union(
    v.array(
      v.object({
        _id: v.id("mcpServers"),
        _creationTime: v.number(),
        memberId: v.id("convexMembers"),
        name: v.string(),
        description: v.optional(v.string()),
        transport: v.union(v.literal("stdio"), v.literal("http")),
        command: v.optional(v.string()),
        args: v.optional(v.array(v.string())),
        env: v.optional(v.record(v.string(), v.string())),
        url: v.optional(v.string()),
        headers: v.optional(v.record(v.string(), v.string())),
        enabled: v.boolean(),
      }),
    ),
    v.null(),
  ),
  handler: async (ctx) => {
    try {
      const member = await getCurrentMember(ctx);
      
      return await ctx.db
        .query("mcpServers")
        .withIndex("byMemberId", (q) => q.eq("memberId", member._id))
        .collect();
    } catch (error) {
      // If user is not authenticated, return null
      return null;
    }
  },
});

/**
 * List only enabled MCP servers for the current user
 */
export const listEnabled = query({
  args: {},
  returns: v.union(
    v.array(
      v.object({
        _id: v.id("mcpServers"),
        _creationTime: v.number(),
        memberId: v.id("convexMembers"),
        name: v.string(),
        description: v.optional(v.string()),
        transport: v.union(v.literal("stdio"), v.literal("http")),
        command: v.optional(v.string()),
        args: v.optional(v.array(v.string())),
        env: v.optional(v.record(v.string(), v.string())),
        url: v.optional(v.string()),
        headers: v.optional(v.record(v.string(), v.string())),
        enabled: v.boolean(),
      }),
    ),
    v.null(),
  ),
  handler: async (ctx) => {
    try {
      const member = await getCurrentMember(ctx);
      
      return await ctx.db
        .query("mcpServers")
        .withIndex("byMemberIdAndEnabled", (q) => 
          q.eq("memberId", member._id).eq("enabled", true)
        )
        .collect();
    } catch (error) {
      // If user is not authenticated, return null
      return null;
    }
  },
});

/**
 * Add a new MCP server
 */
export const add = mutation({
  args: mcpServerValidator,
  returns: v.object({
    serverId: v.id("mcpServers"),
  }),
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    
    // Check if a server with this name already exists for this user
    const existing = await ctx.db
      .query("mcpServers")
      .withIndex("byMemberId", (q) => q.eq("memberId", member._id))
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    
    if (existing) {
      throw new Error(`An MCP server with the name "${args.name}" already exists`);
    }
    
    // Validate based on transport type
    if (args.transport === "stdio") {
      if (!args.command) {
        throw new Error("Command is required for stdio transport");
      }
    } else if (args.transport === "http") {
      if (!args.url) {
        throw new Error("URL is required for HTTP transport");
      }
    }
    
    const serverId = await ctx.db.insert("mcpServers", {
      memberId: member._id,
      name: args.name,
      description: args.description,
      transport: args.transport,
      command: args.command,
      args: args.args,
      env: args.env,
      url: args.url,
      headers: args.headers,
      enabled: args.enabled,
    });
    
    return { serverId };
  },
});

/**
 * Update an existing MCP server
 */
export const update = mutation({
  args: {
    serverId: v.id("mcpServers"),
    updates: mcpServerValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    
    const server = await ctx.db.get(args.serverId);
    if (!server) {
      throw new Error("MCP server not found");
    }
    
    if (server.memberId !== member._id) {
      throw new Error("You don't have permission to update this MCP server");
    }
    
    // Check if the new name conflicts with another server
    if (args.updates.name !== server.name) {
      const existing = await ctx.db
        .query("mcpServers")
        .withIndex("byMemberId", (q) => q.eq("memberId", member._id))
        .filter((q) => q.eq(q.field("name"), args.updates.name))
        .first();
      
      if (existing && existing._id !== args.serverId) {
        throw new Error(`An MCP server with the name "${args.updates.name}" already exists`);
      }
    }
    
    // Validate based on transport type
    if (args.updates.transport === "stdio") {
      if (!args.updates.command) {
        throw new Error("Command is required for stdio transport");
      }
    } else if (args.updates.transport === "http") {
      if (!args.updates.url) {
        throw new Error("URL is required for HTTP transport");
      }
    }
    
    await ctx.db.patch(args.serverId, {
      name: args.updates.name,
      description: args.updates.description,
      transport: args.updates.transport,
      command: args.updates.command,
      args: args.updates.args,
      env: args.updates.env,
      url: args.updates.url,
      headers: args.updates.headers,
      enabled: args.updates.enabled,
    });
    
    return null;
  },
});

/**
 * Delete an MCP server
 */
export const remove = mutation({
  args: {
    serverId: v.id("mcpServers"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    
    const server = await ctx.db.get(args.serverId);
    if (!server) {
      throw new Error("MCP server not found");
    }
    
    if (server.memberId !== member._id) {
      throw new Error("You don't have permission to delete this MCP server");
    }
    
    await ctx.db.delete(args.serverId);
    
    return null;
  },
});

/**
 * Toggle the enabled state of an MCP server
 */
export const toggleEnabled = mutation({
  args: {
    serverId: v.id("mcpServers"),
  },
  returns: v.object({
    enabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    
    const server = await ctx.db.get(args.serverId);
    if (!server) {
      throw new Error("MCP server not found");
    }
    
    if (server.memberId !== member._id) {
      throw new Error("You don't have permission to update this MCP server");
    }
    
    const newEnabled = !server.enabled;
    await ctx.db.patch(args.serverId, {
      enabled: newEnabled,
    });
    
    return { enabled: newEnabled };
  },
});

