import { ALL_TOOLS, systemPrompt, type ToolDef } from "@/features/assistant/tools";

/**
 * The only place OPENROUTER_API_KEY is ever touched.
 *
 * This is a relay, not the agent. Tide's tasks live in the browser's IndexedDB
 * and never reach this server, so the tool loop runs client-side: the browser
 * executes each call against Dexie and posts the results back for the next turn.
 *
 * The client speaks Anthropic-shaped content blocks (text / tool_use /
 * tool_result) — that contract predates this route's move to OpenRouter, and
 * changing it would mean touching useAssistant.ts, tools.ts and execute.ts too.
 * So this file is a translator: OpenAI-style chat completions in and out of
 * OpenRouter, Anthropic-style messages in and out of the browser.
 *
 * The response is newline-delimited JSON rather than raw provider SSE, so the
 * client doesn't have to re-implement event parsing:
 *   {"type":"text","text":"..."}   incremental output
 *   {"type":"done","message":{...}} the complete assistant message
 *   {"type":"error","message":"..."}
 */

export const runtime = "nodejs";

const MODEL = "deepseek/deepseek-v4.1-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Anthropic-shaped content blocks, as the client sends and expects them. */
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface RequestBody {
  messages: AnthropicMessage[];
}

/** What the client needs back: the content to echo, and why the turn stopped. */
interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
  stop_reason: string | null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "No OPENROUTER_API_KEY. Add it to .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "No messages supplied." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const message = await runTurn(apiKey, body.messages, send);

        if (message.stop_reason === "refusal") {
          send({
            type: "error",
            message:
              "The model declined to answer that one. Try rephrasing the request.",
          });
        } else {
          send({ type: "done", message });
        }
      } catch (error) {
        send({ type: "error", message: describe(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Stops a proxy buffering the stream into one lump at the end.
      "X-Accel-Buffering": "no",
    },
  });
}

type Send = (event: unknown) => void;

/** OpenAI-style chat message, as OpenRouter expects and returns them. */
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

async function runTurn(
  apiKey: string,
  messages: AnthropicMessage[],
  send: Send,
): Promise<AssistantMessage> {
  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    ...messages.flatMap(toChatMessages),
  ];

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://tide.local",
      "X-Title": "Tide",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: chatMessages,
      tools: ALL_TOOLS.map(toFunctionTool),
      stream: true,
      // Without a cap OpenRouter defaults to the model's max context, which a
      // metered account's balance may not cover.
      max_tokens: 8000,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(response.status, detail);
  }

  return streamResponse(response.body, send);
}

/** One history entry can expand to several OpenAI messages (tool results). */
function toChatMessages(message: AnthropicMessage): ChatMessage[] {
  if (typeof message.content === "string") {
    return [{ role: message.role, content: message.content }];
  }

  if (message.role === "user") {
    // A user turn after tool calls is entirely tool_result blocks; each
    // becomes its own "tool" message, matched by tool_call_id.
    return message.content.map((block) => {
      if (block.type !== "tool_result") {
        throw new Error("Unexpected block in a user turn.");
      }
      return {
        role: "tool" as const,
        tool_call_id: block.tool_use_id,
        content: block.content,
      };
    });
  }

  const text = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
  const toolUses = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
      block.type === "tool_use",
  );

  return [
    {
      role: "assistant",
      content: text || null,
      tool_calls: toolUses.length
        ? toolUses.map((block) => ({
            id: block.id,
            type: "function" as const,
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          }))
        : undefined,
    },
  ];
}

function toFunctionTool(tool: ToolDef) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/** Accumulating state for one streamed tool call as its arguments trickle in. */
interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

async function streamResponse(
  body: ReadableStream<Uint8Array>,
  send: Send,
): Promise<AssistantMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let text = "";
  const toolCalls: PendingToolCall[] = [];
  let finishReason: string | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") return;

    let event: {
      choices?: {
        delta?: { content?: string; tool_calls?: DeltaToolCall[] };
        finish_reason?: string | null;
      }[];
    };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    const choice = event.choices?.[0];
    if (!choice) return;

    if (choice.delta?.content) {
      text += choice.delta.content;
      send({ type: "text", text: choice.delta.content });
    }

    for (const delta of choice.delta?.tool_calls ?? []) {
      const index = delta.index ?? 0;
      const existing = toolCalls[index];
      if (!existing) {
        toolCalls[index] = {
          id: delta.id ?? "",
          name: delta.function?.name ?? "",
          arguments: delta.function?.arguments ?? "",
        };
      } else {
        if (delta.id) existing.id = delta.id;
        if (delta.function?.name) existing.name += delta.function.name;
        if (delta.function?.arguments) existing.arguments += delta.function.arguments;
      }
    }

    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handleLine(buffer);

  const content: ContentBlock[] = [];
  if (text) content.push({ type: "text", text });
  for (const call of toolCalls) {
    if (!call) continue;
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.arguments ? JSON.parse(call.arguments) : {},
    });
  }

  return {
    role: "assistant",
    content,
    stop_reason: mapFinishReason(finishReason, toolCalls.length > 0),
  };
}

interface DeltaToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

function mapFinishReason(reason: string | null, hasToolCalls: boolean): string | null {
  if (reason === "tool_calls" || hasToolCalls) return "tool_use";
  if (reason === "content_filter") return "refusal";
  if (reason === "length") return "max_tokens";
  if (reason === "stop" || reason === null) return "end_turn";
  return reason;
}

class HttpError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(detail || `OpenRouter returned ${status}`);
  }
}

function describe(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "That API key was rejected. Check OPENROUTER_API_KEY in .env.local.";
    }
    if (error.status === 429) {
      return "Rate limited by OpenRouter. Wait a moment and try again.";
    }
    return `OpenRouter returned ${error.status}: ${error.message}`;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Stopped.";
  }
  if (error instanceof TypeError) {
    return "Couldn't reach OpenRouter. Check your connection.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
