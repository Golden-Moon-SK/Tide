import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ALL_TOOLS, systemPrompt } from "@/features/assistant/tools";

/**
 * The only place ANTHROPIC_API_KEY is ever touched.
 *
 * This is a relay, not the agent. Tide's tasks live in the browser's IndexedDB
 * and never reach this server, so the tool loop runs client-side: the browser
 * executes each call against Dexie and posts the results back for the next turn.
 *
 * The response is newline-delimited JSON rather than raw Anthropic SSE, so the
 * client doesn't have to re-implement event parsing:
 *   {"type":"text","text":"..."}   incremental output
 *   {"type":"done","message":{...}} the complete assistant message
 *   {"type":"error","message":"..."}
 */

export const runtime = "nodejs";

const MODEL = "claude-opus-5";

interface RequestBody {
  messages: MessageParam[];
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "No ANTHROPIC_API_KEY. Add it to .env.local and restart the dev server.",
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

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const message = await runTurn(client, body.messages, send);

        // A refusal comes back as a normal 200 with no usable content, so it
        // has to be checked before the message is read.
        if (message.stop_reason === "refusal") {
          send({
            type: "error",
            message:
              "Claude declined to answer that one. Try rephrasing the request.",
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

/** What the client needs back: the content to echo, and why the turn stopped. */
interface AssistantMessage {
  role: "assistant";
  content: unknown[];
  stop_reason: string | null;
}

/**
 * One request to Claude. Streaming is not optional at this max_tokens — a
 * non-streaming request that large risks an HTTP timeout.
 *
 * Server-side fallbacks are on so a refusal reroutes instead of dead-ending.
 * The beta isn't available on every account, so a 400 naming it retries once
 * without: better a working assistant than a strictly-correct broken one.
 */
async function runTurn(
  client: Anthropic,
  messages: MessageParam[],
  send: Send,
): Promise<AssistantMessage> {
  try {
    return await streamOnce(client, messages, send, true);
  } catch (error) {
    if (!isFallbackBetaRejection(error)) throw error;
    return await streamOnce(client, messages, send, false);
  }
}

async function streamOnce(
  client: Anthropic,
  messages: MessageParam[],
  send: Send,
  withFallbacks: boolean,
): Promise<AssistantMessage> {
  const params = {
    model: MODEL,
    max_tokens: 64000,
    system: systemPrompt(),
    // Adaptive thinking: Claude decides how much to think. budget_tokens is a
    // 400 on this model.
    thinking: { type: "adaptive" as const },
    tools: ALL_TOOLS,
    messages,
  };

  // The beta and non-beta streams are separate types, so each branch attaches
  // its own listener rather than being unified first.
  if (withFallbacks) {
    const stream = client.beta.messages.stream({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as Parameters<typeof client.beta.messages.stream>[0]);
    stream.on("text", (text: string) => send({ type: "text", text }));
    return (await stream.finalMessage()) as unknown as AssistantMessage;
  }

  const stream = client.messages.stream(params);
  stream.on("text", (text: string) => send({ type: "text", text }));
  return (await stream.finalMessage()) as unknown as AssistantMessage;
}

function isFallbackBetaRejection(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError) || error.status !== 400) {
    return false;
  }
  const text = JSON.stringify(error.error ?? error.message ?? "").toLowerCase();
  return text.includes("fallback") || text.includes("server-side-fallback");
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "That API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the API. Check your connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `The API returned ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
