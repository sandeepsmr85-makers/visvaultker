import { Stagehand } from "@browserbasehq/stagehand";
import { WebSocket } from "ws";
import { CustomLLMClient } from "./CustomLLMClient";

export type AutomationModel = "openai" | "anthropic" | "gemini" | "custom";

interface AutomationLog {
  timestamp: number;
  action: string;
  status: string;
  details?: any;
}

interface AutomationResult {
  success: boolean;
  result?: any;
  error?: string;
  logs: AutomationLog[];
  duration: string;
}

export class AutomationExecutor {
  private stagehand: Stagehand | null = null;
  private page: any = null;
  private logs: AutomationLog[] = [];
  private ws: WebSocket | null = null;

  constructor(ws?: WebSocket) {
    this.ws = ws || null;
  }

  private log(action: string, status: string, details?: any) {
    const log = {
      timestamp: Date.now(),
      action,
      status,
      details,
    };
    this.logs.push(log);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: "execution_log",
          data: { log },
        }));
      } catch (error) {
        console.error("Failed to send log:", error);
      }
    }
  }

  async initialize(model: AutomationModel): Promise<void> {
    this.log("Initializing browser automation", "running");

    try {
      const useCustomLLM = process.env.USE_CUSTOM_LLM === "true";

      if (useCustomLLM) {
        const customApiEndpoint = process.env.CUSTOM_LLM_API_ENDPOINT;
        const customModelName = process.env.CUSTOM_LLM_MODEL_NAME || "gpt-4-1-2025-04-14-eastus-dz";

        if (!customApiEndpoint) throw new Error("CUSTOM_LLM_API_ENDPOINT required");

        const customClient = new CustomLLMClient({
          modelName: "gpt-4o",
          apiEndpoint: customApiEndpoint,
          actualModelName: customModelName,
          apiKey: null
        });

        this.stagehand = new Stagehand({
          env: "LOCAL",
          verbose: 1,
          cacheDir: "stagehand-cache",
          llmClient: customClient,
        });

        this.log("Custom OAuth LLM client initialized", "success");
      } else {
        const apiKeys = {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          gemini: process.env.GEMINI_API_KEY,
        };

        const apiKey = apiKeys[model];
        if (!apiKey) throw new Error(`${model} API key missing`);

        const modelMap = {
          openai: "openai/gpt-4o-mini",
          anthropic: "anthropic/claude-3-5-sonnet-20241022",
          gemini: "google/gemini-2.0-flash-exp",
        };

        this.stagehand = new Stagehand({
          env: "LOCAL",
          verbose: 1,
          cacheDir: "stagehand-cache",
          model: modelMap[model],
        });

        this.log("Standard API model initialized", "success", { model });
      }

      await this.stagehand.init();
      this.page = this.stagehand.context.pages()[0];

      this.log("Browser initialized and ready", "success");
    } catch (error: any) {
      this.log("Initialization failed", "error", { error: error.message });
      throw error;
    }
  }

  async execute(prompt: string): Promise<AutomationResult> {
    const startTime = Date.now();

    try {
      if (!this.stagehand || !this.page) throw new Error("Automation not initialized");

      this.log(`Executing: ${prompt}`, "running");

      const urlMatch = prompt.match(/(?:go to|open|navigate to|visit)[\s.]*(?:https?:\/\/)?([^\s,\-]+\.[^\s,\-]+)/i);
      if (urlMatch) {
        const url = urlMatch[1].startsWith("http") ? urlMatch[1] : `https://${urlMatch[1]}`;
        this.log(`Navigating to ${url}`, "running");
        await this.page.goto(url, { waitUntil: "domcontentloaded" });
        this.log("Navigation done", "success");
      }

      const steps = this.parseMultiStepPrompt(prompt);

      if (steps.length > 1) {
        this.log(`Detected ${steps.length} steps`, "running");

        const results: any[] = [];

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          this.log(`Executing step ${i + 1}: ${step}`, "running");

          const stepResult: any = await this.stagehand.act(step);

          if (!stepResult || !stepResult.target || !stepResult.target.elementId) {
            const errorMsg = `Step ${i + 1} failed: No elementId found`;
            this.log(errorMsg, "error", stepResult);

            return {
              success: false,
              error: errorMsg,
              logs: this.logs,
              duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
            };
          }

          results.push(stepResult);
          this.log(`Step ${i + 1} completed`, "success", { stepResult });
          await new Promise(res => setTimeout(res, 500));
        }

        return {
          success: true,
          result: results[results.length - 1],
          logs: this.logs,
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        };
      }

      const result: any = await this.stagehand.act(prompt);

      if (!result || !result.target || !result.target.elementId) {
        const err = "No matching element found or invalid action response";
        this.log(err, "error", { result });

        return {
          success: false,
          error: err,
          logs: this.logs,
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        };
      }

      this.log("Execution completed successfully", "success", { result });

      return {
        success: true,
        result,
        logs: this.logs,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

    } catch (error: any) {
      this.log("Execution failed", "error", { error: error.message });

      return {
        success: false,
        error: error.message,
        logs: this.logs,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };
    }
  }

  private parseMultiStepPrompt(prompt: string): string[] {
    let cleanPrompt = prompt.replace(/(?:go to|open|navigate to|visit)[\s.]*(?:https?:\/\/)?([^\s,\-]+\.[^\s,\-]+)\s*/i, '');

    const keywords = ['search for','search','click on','click','press','tap','type','enter','select','choose','scroll','hover','wait for','submit','upload'];
    const pattern = new RegExp(`\\b(${keywords.join('|')})\\s`, 'gi');

    const parts = cleanPrompt.split(pattern).filter(p => p.trim().length > 0);
    return parts.map(p => p.trim());
  }

  async cleanup(): Promise<void> {
    try {
      if (this.stagehand) await this.stagehand.close();
      this.log("Browser closed", "success");
    } catch (error: any) {
      this.log("Cleanup failed", "error", { error: error.message });
    }
  }

  getLogs(): AutomationLog[] {
    return this.logs;
  }
}
