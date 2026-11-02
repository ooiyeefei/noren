export const AI_CAPABILITIES = ["extract", "translate", "transcribe", "compose", "entail"] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];
// Each capability names its model in AI_MODEL_<CAPABILITY>, so switching provider is a settings
// change: "claude-sonnet-5-5" (Anthropic), "meta:muse-spark-1.3" (Meta Model API) or
// "vendor/model" (Vercel AI Gateway).
export type AiModelConfig = {
  provider: "anthropic" | "gateway" | "meta";
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
export type MetaTranscriptionConfig = { provider: "meta"; apiKey: string; modelId: string };
export type TranscriptionConfig =
  | (AiModelConfig & { provider: "gateway" })
  | CompatibleTranscriptionConfig
  | MetaTranscriptionConfig;
type ConfigResult<T> = { ok: true; config: T } | { ok: false; reason: string };

const META_MODEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function metaKey(
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<{ apiKey: string }> {
  const apiKey = env.META_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "AI is not configured: META_API_KEY is not set" };
  if (/[\r\n\x00-\x1f\x7f]/.test(apiKey))
    return { ok: false, reason: "META_API_KEY must not contain control characters" };
  return { ok: true, config: { apiKey } };
}

function metaTranscriptionConfig(
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<MetaTranscriptionConfig> {
  const modelId = env.TRANSCRIBE_MODEL?.trim();
  if (!modelId) return { ok: false, reason: "TRANSCRIBE_MODEL is not set" };
  if (!META_MODEL.test(modelId))
    return {
      ok: false,
      reason:
        "TRANSCRIBE_MODEL must be a model id without spaces, such as muse-voice-transcribe-1.0",
    };
  const key = metaKey(env);
  if (!key.ok) return key;
  return { ok: true, config: { provider: "meta", apiKey: key.config.apiKey, modelId } };
}

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
): ConfigResult<TranscriptionConfig | AiModelConfig>;
export function aiConfig(
  capability: AiCapability,
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult<TranscriptionConfig | AiModelConfig> {
  const variable =
    capability === "transcribe" ? "TRANSCRIBE_MODEL" : `AI_MODEL_${capability.toUpperCase()}`;
  const modelId = env[variable]?.trim();
  const fallback = " The typed-transcript fallback can be used instead.";
  if (capability === "transcribe") {
    const provider = env.TRANSCRIBE_PROVIDER?.trim();
    if (provider === "openai-compatible") return compatibleConfig(env);
    if (provider === "meta") return metaTranscriptionConfig(env);
    if (provider && provider !== "gateway")
      return {
        ok: false,
        reason: "TRANSCRIBE_PROVIDER must be gateway, openai-compatible or meta.",
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
      !env.AI_GATEWAY_API_KEY?.trim() && !env.ANTHROPIC_API_KEY?.trim() && !env.META_API_KEY?.trim()
        ? "AI_GATEWAY_API_KEY (vendor/model), ANTHROPIC_API_KEY (slashless model) or META_API_KEY (meta:model) is required; "
        : "";
    return { ok: false, reason: `AI is not configured: ${keys}${variable} is not set` };
  }
  if (capability !== "transcribe" && modelId.startsWith("meta:")) {
    const metaModel = modelId.slice("meta:".length);
    if (!META_MODEL.test(metaModel))
      return {
        ok: false,
        reason: `${variable} must be meta: followed by a model id without spaces`,
      };
    const key = metaKey(env);
    if (!key.ok) return key;
    return {
      ok: true,
      config: { provider: "meta", apiKey: key.config.apiKey, modelId: metaModel },
    };
  }
  const gateway = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(modelId);
  const direct = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(modelId);
  if (!gateway && (capability === "transcribe" || !direct))
    return {
      ok: false,
      reason:
        capability === "transcribe"
          ? `${variable} must be a gateway model id (vendor/model).${fallback}`
          : `${variable} must be a slashless Anthropic model id, meta:model or a gateway model id (vendor/model)`,
    };
  const keyVariable = gateway ? "AI_GATEWAY_API_KEY" : "ANTHROPIC_API_KEY";
  const apiKey = env[keyVariable]?.trim();
  if (!apiKey) return { ok: false, reason: `AI is not configured: ${keyVariable} is not set` };
  return gateway
    ? { ok: true, config: { provider: "gateway", apiKey, modelId } }
    : { ok: true, config: { provider: "anthropic", apiKey, modelId } };
}
