const OPENAI_CHAT_MODEL = "gpt-5.4-mini";
const OPENAI_STRUCTURED_MODEL = "gpt-5.4";

type AiEndpoint = "chat/completions" | "responses";

type GatewayConfig = { apiKey: string; baseUrl: string } | null;

function getGatewayConfig(): GatewayConfig {
  // Prefer explicit Netlify AI gateway settings
  const netlifyKey = process.env["NETLIFY_AI_GATEWAY_KEY"];
  const netlifyBase = process.env["NETLIFY_AI_GATEWAY_BASE_URL"];

  // Fallbacks for environments where Netlify is not available
  const lovableKey = process.env["LOVABLE_API_KEY"] || process.env["LOVABLE_GATEWAY_KEY"];
  const connectorKey = process.env["CONNECTOR_GATEWAY_KEY"];

  const baseUrl = (netlifyBase || process.env["LOVABLE_GATEWAY_BASE_URL"] || process.env["CONNECTOR_GATEWAY_BASE_URL"] || "https://connector-gateway.lovable.dev").replace(/\/+$/, "");

  const apiKey = netlifyKey || lovableKey || connectorKey || process.env["NETLIFY_AI_GATEWAY_KEY_FALLBACK"];

  if (!apiKey || !baseUrl) return null;

  return { apiKey, baseUrl };
}

function aiErrorMessage(status: number) {
  if (status === 401 || status === 403) return "AI access is not configured correctly.";
  if (status === 402) return "AI credits are exhausted. Add Netlify credits to continue.";
  if (status === 429) return "The AI service is busy. Try again shortly.";
  if (status >= 500) return "The AI service is temporarily unavailable. Try again shortly.";
  return "The AI request could not be completed.";
}

async function callGateway(endpoint: AiEndpoint, baseUrl: string, apiKey: string, body: Record<string, unknown>) {
  const url = `${baseUrl.replace(/\/+$/, "")}/${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("The AI gateway could not be reached.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    const snippet = text.slice(0, 1000).replace(/\s+/g, " ");
    throw new Error(`AI gateway returned non-JSON response (status ${response.status}): ${snippet}`);
  }

  if (!response.ok) {
    try {
      const json = JSON.parse(text);
      const msg = (json && (json.error || json.message)) || aiErrorMessage(response.status);
      throw new Error(String(msg));
    } catch {
      throw new Error(aiErrorMessage(response.status));
    }
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The AI service returned an invalid JSON response.");
  }
}

export async function requestNetlifyAi<T>(endpoint: AiEndpoint, body: Record<string, unknown>) {
  let lastError: Error | null = null;

  // 1) Try gateway (Lovable / Netlify) if configured
  const gw = getGatewayConfig();
  if (gw) {
    try {
      return (await callGateway(endpoint, gw.baseUrl, gw.apiKey, body)) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // fall through to other fallbacks
    }
  }

  // 2) Try Gemini (Google) if configured
  const geminiKey = process.env["GEMINI_API_KEY"];
  const geminiUrl = (process.env["GEMINI_GATEWAY_BASE_URL"] || process.env["GEMINI_GATEWAY_URL"] || "").trim();
  const geminiDefaultModel = process.env["GEMINI_MODEL"] || "text-bison-001";
  const geminiDefaultUrl = `https://generativelanguage.googleapis.com/v1/models/${geminiDefaultModel}:generate`;
  if (geminiKey) {
    const urlToCall = geminiUrl || geminiDefaultUrl;
    try {
      const res = await fetch(urlToCall, {
        method: "POST",
        headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const ct = res.headers.get("content-type") ?? "";
      const txt = await res.text();
      if (!ct.includes("application/json")) throw new Error(`Gemini returned non-JSON response (status ${res.status})`);
      if (!res.ok) {
        try {
          const json = JSON.parse(txt);
          throw new Error(JSON.stringify(json));
        } catch {
          throw new Error(`Gemini error: ${res.status}`);
        }
      }
      return JSON.parse(txt) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // 3) Fallback to OpenAI if available
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    const openaiUrl = endpoint === "responses" ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions";
    const openaiBody = { ...body } as Record<string, unknown>;
    if (!("model" in openaiBody)) {
      openaiBody.model = endpoint === "responses" ? OPENAI_STRUCTURED_MODEL : OPENAI_CHAT_MODEL;
    }

    try {
      const res = await fetch(openaiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(openaiBody),
      });
      const ct = res.headers.get("content-type") ?? "";
      const txt = await res.text();
      if (!ct.includes("application/json")) throw new Error(`OpenAI returned non-JSON response (status ${res.status})`);
      if (!res.ok) {
        try {
          const json = JSON.parse(txt);
          throw new Error(JSON.stringify(json));
        } catch {
          throw new Error(`OpenAI error: ${res.status}`);
        }
      }
      return JSON.parse(txt) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // 4) No working provider
  if (lastError) throw lastError;
  throw new Error("AI is not configured on this deployment.");
}

export function chatModel() {
  return OPENAI_CHAT_MODEL;
}

export function structuredModel() {
  return OPENAI_STRUCTURED_MODEL;
}

export function safeAiReply(error: unknown) {
  const knownMessages = new Set([
    "AI is not configured on this deployment.",
    "AI access is not configured correctly.",
    "AI credits are exhausted. Add Netlify credits to continue.",
    "The AI service is busy. Try again shortly.",
    "The AI service is temporarily unavailable. Try again shortly.",
    "The AI request could not be completed.",
    "The AI service could not be reached. Try again shortly.",
    "The AI service returned an invalid response.",
    "The AI service returned an empty response.",
    "sell.x reached the action limit for one request. Try a smaller request.",
  ]);
  const message = error instanceof Error ? error.message : String(error ?? "");
  const detail = knownMessages.has(message) ? message : message || "The AI request could not be completed.";
  return `# ⚠️ AI UNAVAILABLE\n\n## What Happened\n- ${detail}\n- Your message was not processed and no action was taken.\n\nACTIONS: [🔄 Try again]`;
}
