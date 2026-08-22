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

export async function requestNetlifyAi<T>(endpoint: AiEndpoint, body: Record<string, unknown>) {
  const gw = getGatewayConfig();
  if (!gw) throw new Error("AI is not configured on this deployment.");
  const { apiKey, baseUrl } = gw;

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The AI service could not be reached. Try again shortly.");
  }

  if (!response.ok) throw new Error(aiErrorMessage(response.status));

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("The AI service returned an invalid response.");
  }
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
  const message = error instanceof Error ? error.message : "";
  const detail = knownMessages.has(message) ? message : "The AI request could not be completed.";
  return `# ⚠️ AI UNAVAILABLE\n\n## What Happened\n- ${detail}\n- Your message was not processed and no action was taken.\n\nACTIONS: [🔄 Try again]`;
}
