export const AI_CAPABILITIES = ["extract", "translate", "transcribe", "compose", "entail"] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];
export type AiModelConfig = {
  provider: "anthropic" | "gateway";
  apiKey: string;
  modelId: string;
};

export type CompatibleTranscriptionConfig = {
  provider: "openai-compatible";
  apiKey: string;
  modelId: string;
  baseURL: string;
  maxBytes: number;
};
export type TranscriptionConfig = AiModelConfig | CompatibleTranscriptionConfig;
type ConfigResult<T> = { ok: true; config: T } | { ok: false; reason: string };

function compatibleConfig(
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<CompatibleTranscriptionConfig> {
  for (const variable of ["TRANSCRIBE_BASE_URL", "TRANSCRIBE_API_KEY", "TRANSCRIBE_MODEL"]) {
    if (!env[variable]?.trim()) return { ok: false, reason: `${variable} is not set` };
  }
  let baseURL: string;
  try {
    const url = new URL(env.TRANSCRIBE_BASE_URL!.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("invalid URL");
    }
    baseURL = url.href.replace(/\/+$/, "");
  } catch {
    return {
      ok: false,
      reason: "TRANSCRIBE_BASE_URL must be an https URL without credentials, query or fragment",
    };
  }
  const apiKey = env.TRANSCRIBE_API_KEY!.trim();
  if (/[\r\n\x00-\x1f\x7f]/.test(apiKey))
    return { ok: false, reason: "TRANSCRIBE_API_KEY must not contain control characters" };
  const modelId = env.TRANSCRIBE_MODEL!.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(modelId))
    return { ok: false, reason: "TRANSCRIBE_MODEL must be a model id without spaces" };
  const rawMaxBytes = env.TRANSCRIBE_MAX_BYTES;
  const maxBytes = rawMaxBytes === undefined ? 24000000 : Number(rawMaxBytes.trim());
  if (
    (rawMaxBytes !== undefined && !/^\d+$/.test(rawMaxBytes.trim())) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  )
    return { ok: false, reason: "TRANSCRIBE_MAX_BYTES must be a positive safe integer" };
  return {
    ok: true,
    config: { provider: "openai-compatible", apiKey, modelId, baseURL, maxBytes },
  };
}

export function aiConfig(
  capability: "transcribe",
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<TranscriptionConfig>;
export function aiConfig(
  capability: Exclude<AiCapability, "transcribe">,
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<AiModelConfig>;
export function aiConfig(
  capability: AiCapability,
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<TranscriptionConfig>;
export function aiConfig(
  capability: AiCapability,
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<TranscriptionConfig> {
  const variable =
    capability === "transcribe" ? "TRANSCRIBE_MODEL" : `AI_MODEL_${capability.toUpperCase()}`;
  const modelId = env[variable]?.trim();
  const fallback = " The typed-transcript fallback can be used instead.";
  if (capability === "transcribe") {
    const provider = env.TRANSCRIBE_PROVIDER?.trim();
    if (provider === "openai-compatible") return compatibleConfig(env);
    if (provider && provider !== "gateway")
      return {
        ok: false,
        reason: "TRANSCRIBE_PROVIDER must be gateway or openai-compatible.",
      };
    if (!env.AI_GATEWAY_API_KEY?.trim())
      return {
        ok: false,
        reason: provider
          ? `AI is not configured: AI_GATEWAY_API_KEY is not set.${fallback}`
          : `AI is not configured: AI_GATEWAY_API_KEY (gateway) or TRANSCRIBE_API_KEY (openai-compatible) and TRANSCRIBE_PROVIDER must be set.${fallback}`,
      };
    if (provider !== "gateway")
      return {
        ok: false,
        reason: `no transcription provider is configured: set TRANSCRIBE_PROVIDER=gateway and TRANSCRIBE_MODEL.${fallback}`,
      };
  }
  if (!modelId) {
    const keys =
      !env.AI_GATEWAY_API_KEY?.trim() && !env.ANTHROPIC_API_KEY?.trim()
        ? "AI_GATEWAY_API_KEY (vendor/model) or ANTHROPIC_API_KEY (slashless model) is required; "
        : "";
    return { ok: false, reason: `AI is not configured: ${keys}${variable} is not set` };
  }
  const gateway = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(modelId);
  const direct = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(modelId);
  if (!gateway && (capability === "transcribe" || !direct))
    return {
      ok: false,
      reason:
        capability === "transcribe"
          ? `${variable} must be a gateway model id (vendor/model).${fallback}`
          : `${variable} must be a slashless Anthropic model id or a gateway model id (vendor/model)`,
    };
  const provider = gateway ? "gateway" : "anthropic";
  const keyVariable = gateway ? "AI_GATEWAY_API_KEY" : "ANTHROPIC_API_KEY";
  const apiKey = env[keyVariable]?.trim();
  if (!apiKey) return { ok: false, reason: `AI is not configured: ${keyVariable} is not set` };
  return { ok: true, config: { provider, apiKey, modelId } };
}
