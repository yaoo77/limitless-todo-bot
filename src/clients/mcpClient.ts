import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private availableTools: MCPTool[] = [];

  constructor(
    private readonly serverUrl: string,
    private readonly apiKey?: string,
  ) {}

  async connect(): Promise<void> {
    console.log(`[MCP] Connecting to ${this.serverUrl}`);

    try {
      // Zapier MCP は JSON-RPC 2.0 を使用
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };

      // Bearer Token 認証を追加
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[MCP] Error response:', errorText);
        throw new Error(`Failed to fetch tools: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Server-Sent Events (SSE) 形式のレスポンスをパース
      const responseText = await response.text();
      const jsonData = this.parseSSEResponse(responseText);

      const data = jsonData as {
        jsonrpc: string;
        id: number;
        result?: {
          tools: MCPTool[];
        };
        error?: {
          code: number;
          message: string;
        };
      };

      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message}`);
      }

      this.availableTools = data.result?.tools || [];
      console.log(`[MCP] Connected. Available tools: ${this.availableTools.length}`);
    } catch (error) {
      console.error('[MCP] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    console.log('[MCP] Disconnected');
  }

  private parseSSEResponse(sseText: string): unknown {
    // Server-Sent Events 形式:
    // event: message
    // data: {"jsonrpc":"2.0", ...}
    //
    // または JSON Lines 形式の場合もある

    const lines = sseText.trim().split('\n');
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLine = line.substring(6); // "data: " を除去
        break;
      }
    }

    if (!dataLine) {
      // SSE形式でない場合、直接JSONとしてパース
      try {
        return JSON.parse(sseText);
      } catch {
        throw new Error(`Failed to parse response: ${sseText.substring(0, 100)}`);
      }
    }

    return JSON.parse(dataLine);
  }

  getAvailableTools(): MCPTool[] {
    return this.availableTools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      console.log(`[MCP] Calling tool: ${name}`, args);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };

      // Bearer Token 認証を追加
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.floor(Math.random() * 1000000),
          method: 'tools/call',
          params: {
            name,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tool call failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Server-Sent Events (SSE) 形式のレスポンスをパース
      const responseText = await response.text();
      const jsonData = this.parseSSEResponse(responseText);

      const data = jsonData as {
        jsonrpc: string;
        id: number;
        result?: unknown;
        error?: {
          code: number;
          message: string;
        };
      };

      if (data.error) {
        throw new Error(`MCP Tool Error: ${data.error.message}`);
      }

      console.log(`[MCP] Tool result:`, data.result);

      return data.result;
    } catch (error) {
      console.error(`[MCP] Tool call error for ${name}:`, error);
      throw error;
    }
  }
}
