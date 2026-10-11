import { NextRequest } from "next/server";
import { streamSewakAnswer } from "@/lib/assistant-server";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1500;
const MAX_HISTORY = 12;
const MAX_BODY_BYTES = 24_000;

function parseMessages(value: unknown): { role: "user" | "assistant"; content: string }[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_HISTORY) return null;
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || !("role" in item) || !("content" in item)) return null;
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return null;
    const content = item.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;
    messages.push({ role: item.role, content });
  }
  if (messages[messages.length - 1].role !== "user") return null;
  return messages;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "The conversation is too large. Start a new chat and try again." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("messages" in body)) {
    return Response.json({ error: "A chat message is required." }, { status: 400 });
  }

  const messages = parseMessages(body.messages);
  if (!messages) {
    return Response.json({ error: `Send 1-${MAX_HISTORY} messages, ending with a user message of at most ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  }
  const area = "area" in body && typeof body.area === "string" && body.area.trim()
    ? body.area.trim().slice(0, 120)
    : "Ward 24, Shastri Nagar, Jaipur";

  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  request.signal.addEventListener("abort", () => streamAbort.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        for await (const item of streamSewakAnswer(messages, area, streamAbort.signal)) {
          send(item.type, item.type === "metadata" ? item.metadata : { token: item.token });
        }
        send("done", {});
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("Sewak assistant stream failed:", error);
          send("error", {
            error: error instanceof Error ? error.message : "The assistant could not complete this request.",
          });
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      streamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
