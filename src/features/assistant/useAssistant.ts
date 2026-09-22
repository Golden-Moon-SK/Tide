"use client";

import { useCallback, useRef, useState } from "react";
import { executeToolCalls, type Proposal, type ToolUseBlock } from "./execute";

/**
 * The agent loop, run in the browser.
 *
 * The route handler is only a relay to Claude; the tools read and write Tide's
 * data, which lives in IndexedDB here. So the loop is: ask → stream the reply →
 * run any tool calls locally → send the results back → repeat until Claude
 * stops asking for tools.
 */

/** A turn in the transcript, which is not the same shape as the API history. */
export interface Entry {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  proposals: Proposal[];
  streaming: boolean;
}

type Resolution = "applied" | "discarded";

/** Content blocks as they come back from the API, echoed back verbatim. */
interface ApiMessage {
  role: "assistant";
  content: unknown[];
  stop_reason: string | null;
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: unknown;
}

// Enough for read → propose → summarise several times over; a cap that stops a
// malfunctioning loop from spending tokens forever.
const MAX_TURNS = 8;

export function useAssistant() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const history = useRef<HistoryMessage[]>([]);
  const abort = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, change: Partial<Entry>) => {
    setEntries((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    );
  }, []);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || busy) return;

      const userEntry: Entry = {
        id: crypto.randomUUID(),
        role: "user",
        text: prompt,
        proposals: [],
        streaming: false,
      };
      const replyId = crypto.randomUUID();
      setEntries((list) => [
        ...list,
        userEntry,
        {
          id: replyId,
          role: "assistant",
          text: "",
          proposals: [],
          streaming: true,
        },
      ]);

      history.current.push({ role: "user", content: prompt });
      setBusy(true);

      const controller = new AbortController();
      abort.current = controller;

      // Text and proposals accumulate across every turn of one exchange, so the
      // transcript reads as a single reply rather than a machine's worklog.
      let reply = "";
      const collected: Proposal[] = [];

      try {
        for (let turn = 0; turn < MAX_TURNS; turn += 1) {
          const message = await streamTurn(
            history.current,
            controller.signal,
            (chunk) => {
              reply += chunk;
              patch(replyId, { text: reply });
            },
          );

          history.current.push({
            role: "assistant",
            content: message.content,
          });

          const toolUses = message.content.filter(
            (block): block is ToolUseBlock =>
              typeof block === "object" &&
              block !== null &&
              (block as { type?: string }).type === "tool_use",
          );

          if (toolUses.length === 0 || message.stop_reason !== "tool_use") break;

          const { results, proposals } = await executeToolCalls(toolUses);
          collected.push(...proposals);
          patch(replyId, { proposals: [...collected] });

          // Every tool_result goes back in ONE user message. Splitting them
          // teaches the model to stop calling tools in parallel.
          history.current.push({ role: "user", content: results });
        }

        patch(replyId, { streaming: false, proposals: [...collected] });
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Stopped."
            : error instanceof Error
              ? error.message
              : "Something went wrong.";
        // Drop the half-finished turn so the next request isn't sent a
        // conversation the API will reject.
        if (history.current.at(-1)?.role === "assistant") history.current.pop();
        patch(replyId, { streaming: false });
        setEntries((list) => [
          ...list,
          {
            id: crypto.randomUUID(),
            role: "error",
            text: message,
            proposals: [],
            streaming: false,
          },
        ]);
      } finally {
        abort.current = null;
        setBusy(false);
      }
    },
    [busy, patch],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const applyProposal = useCallback(async (proposal: Proposal) => {
    await proposal.apply();
    setResolved((current) => ({ ...current, [proposal.id]: "applied" }));
  }, []);

  const discardProposal = useCallback((proposal: Proposal) => {
    setResolved((current) => ({ ...current, [proposal.id]: "discarded" }));
  }, []);

  const applyAll = useCallback(
    async (proposals: Proposal[]) => {
      for (const proposal of proposals) {
        if (resolved[proposal.id]) continue;
        await applyProposal(proposal);
      }
    },
    [resolved, applyProposal],
  );

  const clear = useCallback(() => {
    history.current = [];
    setEntries([]);
    setResolved({});
  }, []);

  return {
    entries,
    busy,
    resolved,
    send,
    stop,
    clear,
    applyProposal,
    discardProposal,
    applyAll,
  };
}

/** One request to the relay, decoding its newline-delimited JSON. */
async function streamTurn(
  messages: HistoryMessage[],
  signal: AbortSignal,
  onText: (chunk: string) => void,
): Promise<ApiMessage> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The server sent an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let message: ApiMessage | null = null;
  let failure: string | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as
      | { type: "text"; text: string }
      | { type: "done"; message: ApiMessage }
      | { type: "error"; message: string };

    if (event.type === "text") onText(event.text);
    else if (event.type === "done") message = event.message;
    else failure = event.message;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // A chunk can split a line, so only whole lines are parsed and the
    // remainder waits for the next read.
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle(buffer);

  if (failure) throw new Error(failure);
  if (!message) throw new Error("The reply ended before it was complete.");
  return message;
}
