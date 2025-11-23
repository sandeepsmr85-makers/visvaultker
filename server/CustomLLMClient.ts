import { spawn } from "child_process";
import {
  LLMClient,
  CreateChatCompletionOptions,
  LLMResponse,
  AvailableModel,
} from "@browserbasehq/stagehand";
import https from "https";

// Allow self-signed SSL certificates for local development
if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type ResponseModelSchema = any; // keep generic until you have a schema type

// Logger function for CustomLLMClient
function logger(options: { category: string; message: string; level?: number }) {
  const prefix = `[${options.category}]`;
  if (options.level === 0) {
    console.error(prefix, options.message);
  } else {
    console.log(prefix, options.message);
  }
}

function safeJSONParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * CustomLLMClient
 *
 * Replaces/extends the previous implementation with:
 * - robust normalization for Stagehand v3 params (message vs messages)
 * - HTTPS requests with timeouts
 * - token refresh with retries and exponential backoff
 * - guarded parsing and consistent output shape so downstream always gets elementId/method/arguments
 */
export class CustomLLMClient extends LLMClient {
  readonly type = "custom";
  private apiEndpoint: string;
  private apiKey: string | null = null; // optional if using OAuth token
  private actualModelName: string;
  private oauthToken: string | null = null;
  private baseURL: string | null = null;

  constructor({
    modelName = "gpt-4o" as AvailableModel,
    apiEndpoint,
    apiKey = null,
    actualModelName = "gpt-4-1-2025-04-14-eastus-dz",
  }: {
    modelName?: AvailableModel;
    apiEndpoint: string;
    apiKey?: string | null;
    actualModelName?: string;
  }) {
    super(modelName);
    this.apiEndpoint = apiEndpoint;
    this.apiKey = apiKey;
    this.actualModelName = actualModelName;
    this.hasVision = false;
  }

  /**
   * createChatCompletion
   *
   * Returns:
   * - If a response schema is requested (response_model / responseSchema exists), attempts to return a normalized action:
   *   { elementId: string, method: string | null, arguments: any[], description?: string, _rawResponse?: LLMResponse }
   * - Otherwise returns a canonical LLMResponse (typed), with safe defaults present if Stagehand expects elementId.
   */
  async createChatCompletion<T = LLMResponse>(
    params: CreateChatCompletionOptions
  ): Promise<T> {
    const maxAttempts = 3;
    const baseBackoffMs = 400;

    // Stagehand v3 sometimes passes parameters nested under .options
    const stagehandParams: any = (params as any).options ?? params;

    // Normalize messages: Stagehand may use 'message' (singular) or 'messages' (plural)
    const rawMessages = stagehandParams.messages ?? stagehandParams.message;
    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      logger({
        category: "custom-llm",
        message:
          "Invalid messages parameter: expected non-empty array under 'messages' or 'message'.",
        level: 0,
      });
      throw new Error("Messages parameter must be a non-empty array");
    }

    const messages = rawMessages;
    const temperature = stagehandParams.temperature ?? 0.0;
    const maxTokens =
      stagehandParams.maxTokens ??
      stagehandParams.max_tokens ??
      stagehandParams.max_tokens ??
      512;

    // response schema (if caller expects structured output)
    const responseSchema: ResponseModelSchema =
      stagehandParams.response_model ?? stagehandParams.responseSchema ?? null;

    // ensure oauth token exists (fetch if needed)
    if (!this.oauthToken) {
      logger({
        category: "custom-llm",
        message: "No OAuth token found, fetching token...",
        level: 1,
      });
      const tokenResp = await this.fetchOAuthConfigWithRetries();
      this.oauthToken = (tokenResp as any)?.access_token ?? null;
      if ((tokenResp as any)?.baseURL) this.baseURL = (tokenResp as any).baseURL;
      if (!this.oauthToken) {
        throw new Error("Failed to obtain OAuth token");
      }
      logger({ category: "custom-llm", message: "OAuth token fetched", level: 1 });
    }

    // format messages for the API
    const formattedMessages = messages.map((m: any) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    const payload = {
      model: this.actualModelName,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens,
    };

    const requestBody = JSON.stringify(payload);

    // Build endpoint explicitly and sanitize trailing slashes
    const endpoint = this.baseURL
      ? `${this.baseURL.replace(/\/+$/, "")}/chat/completions`
      : this.apiEndpoint;

    const url = new URL(endpoint);

    // Helper that performs a single HTTP request with timeout
    const doRequestOnce = (token: string, timeoutMs = 20000) =>
      new Promise<any>((resolve, reject) => {
        const reqOptions: https.RequestOptions = {
          hostname: url.hostname,
          port: url.port ? Number(url.port) : 443,
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Length": Buffer.byteLength(requestBody),
          },
        };

        const req = https.request(reqOptions, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk.toString()));
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              const parsed = safeJSONParse(body);
              if (parsed === null) {
                return reject(new Error(`Invalid JSON response (truncated): ${body.slice(0, 300)}`));
              }
              return resolve(parsed);
            } else if (status === 401) {
              return reject(new Error("Unauthorized"));
            } else {
              return reject(new Error(`HTTP ${status}: ${body.slice(0, 300)}`));
            }
          });
        });

        req.on("error", (err) => reject(err));
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error("Request timed out"));
        });
        req.write(requestBody);
        req.end();
      });

    // Retry loop with exponential backoff and token refresh on 401
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        logger({
          category: "custom-llm",
          message: `Request attempt ${attempt} to ${endpoint} (messages=${formattedMessages.length})`,
          level: 1,
        });

        const data = await doRequestOnce(this.oauthToken as string, 20000);

        // Defensive extraction of message text
        const rawChoice = data?.choices?.[0] ?? null;
        const messageContent =
          rawChoice?.message?.content ?? rawChoice?.text ?? data?.content ?? "";

        // If caller requested a structured response/schema, attempt to parse and normalize
        if (responseSchema) {
          // Try direct JSON parse first
          const parsed = safeJSONParse(messageContent);
          if (parsed && typeof parsed === "object") {
            const normalized = this._normalizeActionObject(parsed, data);
            return normalized as any as T;
          }

          // Try to extract JSON substring and parse
          const jsonMatch = messageContent.match(/[\[{][\s\S]*[\]}]/);
          if (jsonMatch) {
            const extracted = safeJSONParse(jsonMatch[0]);
            if (extracted && typeof extracted === "object") {
              const normalized = this._normalizeActionObject(extracted, data);
              return normalized as any as T;
            }
          }

          // Parsing failed — return safe default normalized action so Stagehand won't crash
          logger({
            category: "custom-llm",
            message: "Failed to parse structured response; returning safe default action",
            level: 1,
          });

          return {
            elementId: "0-1",
            method: null,
            arguments: [],
            description: "",
            _rawResponse: this._buildLLMResponseFromRaw(data, messageContent),
          } as any as T;
        }

        // No structured response requested — return canonical LLMResponse with safe defaults
        const llmResp = this._buildLLMResponseFromRaw(data, messageContent);
        // Ensure safe top-level keys in case Stagehand expects elementId
        (llmResp as any).elementId = (llmResp as any).elementId ?? "0-1";
        (llmResp as any).method = (llmResp as any).method ?? null;
        (llmResp as any).arguments = (llmResp as any).arguments ?? [];

        return llmResp as any as T;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        logger({
          category: "custom-llm",
          message: `Attempt ${attempt} failed: ${msg}`,
          level: 0,
        });

        if (msg.includes("Unauthorized")) {
          // Refresh token and retry immediately (if attempts remain)
          logger({
            category: "custom-llm",
            message: "Unauthorized — refreshing token and retrying",
            level: 1,
          });
          try {
            const tokenResp = await this.fetchOAuthConfigWithRetries();
            this.oauthToken = (tokenResp as any)?.access_token ?? null;
            if (!this.oauthToken) throw new Error("Token refresh failed (no access_token)");
            // continue to next attempt
          } catch (tokenErr) {
            logger({
              category: "custom-llm",
              message: `Token refresh failed: ${tokenErr instanceof Error ? tokenErr.message : tokenErr}`,
              level: 0,
            });
            // don't swallow; either retry loop continues or throw if last attempt
          }
        }

        if (attempt >= maxAttempts) {
          throw new Error(`Max retries exceeded: ${msg}`);
        }

        // Backoff before retrying
        const backoff = baseBackoffMs * 2 ** (attempt - 1);
        await sleep(backoff);
      }
    }

    throw new Error("createChatCompletion: exhausted retries (unexpected)");
  }

  /**
   * Normalize a parsed LLM object into the expected action shape.
   * Ensures elementId and method exist (or safe defaults).
   */
  private _normalizeActionObject(parsed: any, rawData: any) {
    // extract element id from common places
    let rawId: any =
      parsed.elementId ??
      parsed.element?.id ??
      parsed.element?.elementId ??
      parsed.target?.id ??
      parsed.id ??
      null;

    if (!rawId && Array.isArray(parsed.ids) && parsed.ids.length) rawId = parsed.ids[0];

    let elementId = "0-1";
    if (rawId != null) {
      if (Array.isArray(rawId)) elementId = String(rawId[0]);
      else elementId = String(rawId);
      elementId = elementId.replace(/[\[\]\s'"]/g, "") || "0-1";
    }

    const method = parsed.method ?? parsed.action ?? parsed.verb ?? null;
    const args =
      parsed.arguments ??
      (parsed.argument ? (Array.isArray(parsed.argument) ? parsed.argument : [parsed.argument]) : []);

    const normalized = {
      elementId,
      method: method ?? null,
      arguments: Array.isArray(args) ? args : [args].filter(Boolean),
      description: parsed.description ?? "",
      _parsed: parsed,
      _rawResponse: this._buildLLMResponseFromRaw(rawData, typeof rawData === "string" ? rawData : ""),
    };

    return normalized;
  }

  /**
   * Build a canonical LLMResponse from the raw API response (defensive)
   */
  private _buildLLMResponseFromRaw(raw: any, messageContent: string) {
    const rawChoice = raw?.choices?.[0] ?? null;
    const extractedContent =
      rawChoice?.message?.content ?? rawChoice?.text ?? messageContent ?? "";

    const llmResp: any = {
      id: raw?.id ?? `custom-${Date.now()}`,
      object: raw?.object ?? "chat.completion",
      created: raw?.created ?? Math.floor(Date.now() / 1000),
      model: this.actualModelName,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: extractedContent },
          finish_reason: rawChoice?.finish_reason ?? "stop",
        },
      ],
      usage: raw?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    return llmResp as LLMResponse;
  }

  /**
   * Fetch OAuth config with retries (uses Python script spawn fallback).
   * Prefer replacing this with an HTTP token provider in production.
   */
  private async fetchOAuthConfigWithRetries(retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await this._spawnPythonFetchToken(10000);
        if (res && res.access_token) return res;
        throw new Error("No access_token in token response");
      } catch (err: any) {
        logger({
          category: "custom-llm",
          message: `fetchOAuth attempt ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
          level: 1,
        });
        if (i === retries - 1) throw err;
        await sleep(500 * (i + 1));
      }
    }
    throw new Error("fetchOAuthConfigWithRetries exhausted");
  }

  /**
   * Spawn a Python process to fetch token (safe: timeout + parsing)
   * Expects the Python script to write valid JSON to stdout on success.
   */
  private _spawnPythonFetchToken(timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonExe = "python"; // modify if you need "python3" in some envs
      const proc = spawn(pythonExe, ["fetch_token.py"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let out = "";
      let errOut = "";

      const killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Token fetch timed out"));
      }, timeoutMs);

      proc.stdout.on("data", (b) => (out += b.toString()));
      proc.stderr.on("data", (b) => (errOut += b.toString()));

      proc.on("close", (code) => {
        clearTimeout(killTimer);
        if (code !== 0) {
          return reject(new Error(`Token script failed (${code}): ${errOut.slice(0, 300)}`));
        }
        const parsed = safeJSONParse(out.trim());
        if (!parsed) return reject(new Error(`Failed to parse token JSON: ${out.slice(0, 300)}`));
        return resolve(parsed);
      });

      proc.on("error", (e) => {
        clearTimeout(killTimer);
        reject(e);
      });
    });
  }
}
