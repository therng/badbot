import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";
const DEFAULT_IMSG_DIR = "/Users/supachai/.codex/skills/imsg";
const IMSG_BIN = process.env.IMSG_BIN ?? `${DEFAULT_IMSG_DIR}/bin/imsg`;
const IMSG_DB_PATH = process.env.IMSG_DB_PATH;
const COMMAND_TIMEOUT_MS = Number(process.env.IMSG_TIMEOUT_MS ?? 30_000);

function createToolError(message, cause) {
  const error = new Error(message);
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function appendGlobalArgs(args) {
  if (!IMSG_DB_PATH) {
    return args;
  }

  return [args[0], "--db", IMSG_DB_PATH, ...args.slice(1)];
}

async function runImsg(args) {
  const finalArgs = appendGlobalArgs(args);

  try {
    return await execFileAsync(IMSG_BIN, finalArgs, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createToolError(
        `imsg binary not found at ${IMSG_BIN}. Build it first with 'make build' in ${DEFAULT_IMSG_DIR}, or set IMSG_BIN to a working binary.`,
        error
      );
    }

    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    const details = [stderr, stdout].filter(Boolean).join(" | ");

    throw createToolError(
      details
        ? `imsg command failed: ${details}`
        : `imsg command failed with exit code ${error?.code ?? "unknown"}`,
      error
    );
  }
}

function parseJsonLines(stdout, label) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  try {
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    throw createToolError(`Failed to parse ${label} JSON output from imsg.`, error);
  }
}

function summarizeTarget({
  recipient,
  chatId,
  chatIdentifier,
  chatGuid,
}) {
  if (recipient) return recipient;
  if (chatId != null) return `chat_id:${chatId}`;
  if (chatIdentifier) return `chat_identifier:${chatIdentifier}`;
  if (chatGuid) return `chat_guid:${chatGuid}`;
  return "unknown target";
}

function validateSendTarget({
  recipient,
  chatId,
  chatIdentifier,
  chatGuid,
}) {
  const hasRecipient = Boolean(recipient);
  const hasChatTarget = chatId != null || Boolean(chatIdentifier) || Boolean(chatGuid);

  if (hasRecipient && hasChatTarget) {
    throw createToolError("Provide either recipient or chat targeting fields, not both.");
  }

  if (!hasRecipient && !hasChatTarget) {
    throw createToolError(
      "Provide recipient, chatId, chatIdentifier, or chatGuid so imsg knows where to send the message."
    );
  }
}

function buildHistoryArgs({
  chatId,
  limit,
  participants,
  start,
  end,
  includeAttachments,
}) {
  const args = [
    "history",
    "--chat-id",
    String(chatId),
    "--limit",
    String(limit ?? 25),
    "--json",
  ];

  if (includeAttachments) {
    args.push("--attachments");
  }

  if (participants?.length) {
    args.push("--participants", participants.join(","));
  }

  if (start) {
    args.push("--start", start);
  }

  if (end) {
    args.push("--end", end);
  }

  return args;
}

function buildSendArgs({
  recipient,
  chatId,
  chatIdentifier,
  chatGuid,
  text,
  filePath,
  service,
  region,
}) {
  const args = ["send", "--json"];

  if (recipient) {
    args.push("--to", recipient);
  }
  if (chatId != null) {
    args.push("--chat-id", String(chatId));
  }
  if (chatIdentifier) {
    args.push("--chat-identifier", chatIdentifier);
  }
  if (chatGuid) {
    args.push("--chat-guid", chatGuid);
  }
  if (text) {
    args.push("--text", text);
  }
  if (filePath) {
    args.push("--file", filePath);
  }

  args.push("--service", service ?? "auto");
  args.push("--region", region ?? "US");

  return args;
}

function createImsgServer() {
  const server = new McpServer({
    name: "imsg-chatgpt-app",
    version: "0.1.0",
  });

  server.registerTool(
    "list_chats",
    {
      title: "List Chats",
      description:
        "Use this when you need recent iMessage or SMS conversations so you can identify a chat before reading history or sending a message.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ limit = 20 }) => {
      const { stdout } = await runImsg(["chats", "--limit", String(limit), "--json"]);
      const chats = parseJsonLines(stdout, "chat list");

      return {
        structuredContent: { chats },
        content: [
          {
            type: "text",
            text: `Found ${chats.length} recent chat${chats.length === 1 ? "" : "s"}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_chat_history",
    {
      title: "Get Chat History",
      description:
        "Use this when you already know the chat id and need recent messages, optionally filtered by participants or time range.",
      inputSchema: {
        chatId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).optional(),
        participants: z.array(z.string().min(1)).max(20).optional(),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        includeAttachments: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({
      chatId,
      limit = 25,
      participants,
      start,
      end,
      includeAttachments = true,
    }) => {
      const { stdout } = await runImsg(
        buildHistoryArgs({
          chatId,
          limit,
          participants,
          start,
          end,
          includeAttachments,
        })
      );
      const messages = parseJsonLines(stdout, "chat history");

      return {
        structuredContent: {
          chatId,
          messages,
        },
        content: [
          {
            type: "text",
            text: `Loaded ${messages.length} message${messages.length === 1 ? "" : "s"} from chat ${chatId}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "send_message",
    {
      title: "Send Message",
      description:
        "Use this when the user explicitly wants to send an iMessage or SMS, either to a recipient or into an existing chat.",
      inputSchema: {
        recipient: z.string().min(1).optional(),
        chatId: z.number().int().positive().optional(),
        chatIdentifier: z.string().min(1).optional(),
        chatGuid: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        filePath: z.string().min(1).optional(),
        service: z.enum(["auto", "imessage", "sms"]).optional(),
        region: z.string().length(2).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false,
      },
    },
    async ({
      recipient,
      chatId,
      chatIdentifier,
      chatGuid,
      text,
      filePath,
      service = "auto",
      region = "US",
    }) => {
      validateSendTarget({ recipient, chatId, chatIdentifier, chatGuid });

      if (!text && !filePath) {
        throw createToolError("Provide text or filePath before calling send_message.");
      }

      const { stdout } = await runImsg(
        buildSendArgs({
          recipient,
          chatId,
          chatIdentifier,
          chatGuid,
          text,
          filePath,
          service,
          region,
        })
      );

      const result = parseJsonLines(stdout, "send response")[0] ?? { status: "sent" };
      const target = summarizeTarget({ recipient, chatId, chatIdentifier, chatGuid });

      return {
        structuredContent: {
          ...result,
          target,
          service,
        },
        content: [
          {
            type: "text",
            text: `Sent message to ${target}.`,
          },
        ],
      };
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname.startsWith(MCP_PATH)) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("imsg ChatGPT MCP server");
    return;
  }

  const allowedMethods = new Set(["GET", "POST", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && allowedMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createImsgServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`imsg ChatGPT MCP server listening on http://localhost:${PORT}${MCP_PATH}`);
  console.log(`Using imsg binary: ${IMSG_BIN}`);
});
