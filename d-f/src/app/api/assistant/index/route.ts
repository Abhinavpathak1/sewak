import { NextRequest } from "next/server";
import { indexAssistantKnowledge, verifyIndexToken } from "@/lib/assistant-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.ASSISTANT_INDEX_TOKEN) {
    return Response.json({ error: "Assistant indexing is disabled until ASSISTANT_INDEX_TOKEN is configured." }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!verifyIndexToken(token)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return Response.json(await indexAssistantKnowledge(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Sewak assistant indexing failed:", error);
    return Response.json({
      error: error instanceof Error ? error.message : "Assistant indexing failed.",
    }, { status: 503 });
  }
}
