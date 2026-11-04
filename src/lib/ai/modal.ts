import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Our Modal endpoint through its OpenAI-compatible Chat Completions API. The server is SGLang:
 * never ask it for a json_schema response format, which can loop on whitespace until max_tokens.
 * Ask for structured output with one forced tool call instead.
 */
export function createModal(options: { apiKey: string; baseURL?: string; fetch?: typeof fetch }) {
  if (!options.baseURL) throw new Error("a modal: model needs MODAL_BASE_URL");
  const provider = createOpenAI({
    name: "modal",
    baseURL: `${options.baseURL.replace(/\/+$/, "")}/v1`,
    apiKey: options.apiKey,
    fetch: options.fetch,
  });
  return (modelId: string): LanguageModel => provider.chat(modelId);
}
