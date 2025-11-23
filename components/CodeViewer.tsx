import React, { useState } from 'react';
import { Copy, FileCode, FileJson } from 'lucide-react';

const tsCode = `import { spawn } from "child_process";
import {
  LLMClient,
  CreateChatCompletionOptions,
  LLMResponse,
  AvailableModel,
  LogLine
} from "@browserbasehq/stagehand";
import https from "https";

// Mock logger for standalone usage
const logger = (log: LogLine) => console.log(\`[\${log.category}] \${log.message}\`);

export class CustomLLMClient extends LLMClient {
  readonly type = "custom";
  private apiEndpoint: string;
  private apiKey: string | null;
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

  async createChatCompletion(
    params: CreateChatCompletionOptions
  ): Promise<LLMResponse> {
    let retries = 3;
    const { messages, temperature, maxTokens } = params;
    const options = params as any; // Handle flexible options

    // Fetch OAuth token if not yet fetched
    if (!this.oauthToken) {
      try {
        const tokenResponse = (await this.fetchOAuthConfig()) as {
          access_token: string;
          baseURL?: string;
        };
        this.oauthToken = tokenResponse.access_token;
        if (tokenResponse.baseURL) {
          this.baseURL = tokenResponse.baseURL;
        }
        logger({
          category: "custom-llm",
          message: "Fetched OAuth token",
          level: 1,
        });
      } catch (err) {
        logger({
          category: "custom-llm",
          message: \`Failed to fetch OAuth token: \${
            err instanceof Error ? err.message : String(err)
          }\`,
          level: 0,
        });
        throw err;
      }
    }

    const makeRequest = () =>
      new Promise<any>(async (resolve, reject) => {
        const requestPayload = {
          model: this.actualModelName,
          messages: messages.map((msg) => ({
            role: msg.role,
            content:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
          })),
          temperature,
          max_tokens: maxTokens,
        };

        const requestBody = JSON.stringify(requestPayload);

        try {
          // Use baseURL from OAuth config if available, otherwise use apiEndpoint
          const endpoint = this.baseURL
            ? \`\${this.baseURL}/chat/completions\`
            : this.apiEndpoint;
          const url = new URL(endpoint);

          const reqOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: \`Bearer \${this.oauthToken}\`,
              "Content-Length": Buffer.byteLength(requestBody),
            },
            rejectUnauthorized: false,
          };

          let responseData = "";

          const req = https.request(reqOptions, (res) => {
            res.on("data", (chunk) => {
              responseData += chunk;
            });

            res.on("end", () => {
              if (
                res.statusCode &&
                res.statusCode >= 200 &&
                res.statusCode < 300
              ) {
                try {
                  const data = JSON.parse(responseData);
                  resolve(data);
                } catch (e) {
                  reject(new Error(\`Failed to parse response: \${responseData}\`));
                }
              } else if (res.statusCode === 401) {
                // Token possibly expired, clear for refresh
                this.oauthToken = null;
                reject(
                  new Error(
                    \`Unauthorized – token expired or invalid: \${responseData}\`
                  )
                );
              } else {
                reject(
                  new Error(
                    \`API request failed with status \${res.statusCode}: \${responseData}\`
                  )
                );
              }
            });
          });

          req.on("error", (err) => reject(err));
          req.write(requestBody);
          req.end();
        } catch (err) {
          reject(err);
        }
      });

    while (retries > 0) {
      try {
        const data = await makeRequest();

        // Construct LLMResponse from API data
        const messageContent =
          data?.choices?.[0]?.message?.content || data.content || "";
        const toolCalls =
          Array.isArray(data?.choices?.[0]?.message?.tool_calls) &&
          data.choices[0].message.tool_calls.length > 0
            ? data.choices[0].message.tool_calls
            : [];

        const messageObj: any = { role: "assistant", content: messageContent };
        if (toolCalls.length > 0) messageObj.tool_calls = toolCalls;

        const formattedResponse: LLMResponse = {
          id: "custom-6b",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: this.actualModelName,
          choices: [
            {
              index: 0,
              message: messageObj,
              finish_reason: data?.choices?.[0]?.finish_reason || "stop",
            },
          ],
          usage: {
            prompt_tokens: data?.usage?.prompt_tokens || 0,
            completion_tokens: data?.usage?.completion_tokens || 0,
            total_tokens: data?.usage?.total_tokens || 0,
          },
        };

        // Optional structured parsing if requested by options.response_model
        if (options.response_model) {
          logger({
            category: "custom-llm",
            message: \`Response model requested, parsing: \${messageContent}\`,
            level: 1,
          });

          try {
            const parsedData = JSON.parse(messageContent);
            logger({
              category: "custom-llm",
              message: \`Parsed \${JSON.stringify(parsedData, null, 2)}\`,
              level: 1,
            });

            if (parsedData && typeof parsedData === "object") {
                // Handle response with element object
               if (parsedData.elementId || (parsedData.element && parsedData.method)) {
                 const rawId = parsedData.elementId || parsedData.element.id || "0-1";
                 const elementId = typeof rawId === "string" ? rawId.replace(/[\\[\\]\\s'"]/g, "") : String(rawId);
                 
                 const normalizedData = {
                    elementId,
                    method: parsedData.action || parsedData.method,
                    arguments: parsedData.argument ? [parsedData.argument] : parsedData.arguments || [],
                 };
                 logger({ category: "custom-llm", message: \`Normalized data: \${JSON.stringify(normalizedData)}\`, level: 1 });
                 return { normalizedData, usage: formattedResponse.usage };
               }
            }
            return { parsedData, usage: formattedResponse.usage };
          } catch (e) {
             // Fallback JSON extraction logic...
             const jsonMatch = messageContent.match(/[\\[{][\\s\\S]*[\\]}]/);
             if (jsonMatch) {
                try {
                    const extractedJson = JSON.parse(jsonMatch[0]);
                    if (extractedJson.element && extractedJson.action) {
                        const elementId = extractedJson.element.id?.replace(/[\\[\\]\\s'"]/g, "0-1");
                        const normalizedData = {
                            elementId,
                            method: extractedJson.action,
                            arguments: extractedJson.argument ? [extractedJson.argument] : extractedJson.arguments || [],
                        };
                        return { normalizedData, usage: formattedResponse.usage };
                    }
                    return { extractedJson, usage: formattedResponse.usage };
                } catch (e2) {}
             }
          }
        }

        return formattedResponse;
      } catch (error: any) {
        if (error.message.includes("Unauthorized")) {
          retries--;
          if (retries === 0) throw error;
          try {
            const tokenResponse = (await this.fetchOAuthConfig()) as {
              access_token: string;
            };
            this.oauthToken = tokenResponse.access_token;
            logger({
              category: "custom-llm",
              message: "Refreshed OAuth token after unauthorized error",
              level: 1,
            });
          } catch (tokenError: any) {
            logger({
              category: "custom-llm",
              message: \`Failed to refresh OAuth token: \${tokenError.message}\`,
              level: 0,
            });
            throw tokenError;
          }
        } else {
          logger({
            category: "custom-llm",
            message: \`Error: \${error.message}\`,
            level: 0,
          });
          if (retries <= 0) throw error;
        }
      }
    }
    throw new Error("Failed after retries");
  }

  async fetchOAuthConfig(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn("python", ["fetch_token.py"]);
      let output = "";
      let errorOutput = "";

      pythonProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(\`Python script failed: \${errorOutput}\`));
        } else {
          try {
            const result = JSON.parse(output.trim());
            if (result.error) {
              reject(new Error(\`OAuth error: \${result.error}\`));
            } else {
              resolve(result);
            }
          } catch (e) {
            reject(new Error(\`Failed to parse OAuth response: \${output}\`));
          }
        }
      });
    });
  }
}`;

const pyCode = `import json
import sys
# import requests # If needed for HTTP calls

def get_oauth_token():
    # TODO: Implement your token fetching logic here
    # Example: Fetch from Azure CLI, AWS Cognito, or custom auth endpoint
    
    # Mock Response
    return {
        "access_token": "ey...mock_token...",
        "baseURL": "https://your-custom-llm-endpoint.com/v1"
    }

if __name__ == "__main__":
    try:
        token_data = get_oauth_token()
        print(json.dumps(token_data))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
`;

const CodeViewer: React.FC = () => {
    const [activeFile, setActiveFile] = useState<'ts' | 'py'>('ts');

    const handleCopy = () => {
        navigator.clipboard.writeText(activeFile === 'ts' ? tsCode : pyCode);
    };

  return (
    <div className="relative group flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <button 
            onClick={() => setActiveFile('ts')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-medium border-t border-l border-r ${activeFile === 'ts' ? 'bg-[#0c0c0e] border-zinc-800 text-indigo-400' : 'bg-zinc-900 border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
            <FileCode className="w-3.5 h-3.5" />
            CustomLLMClient.ts
        </button>
        <button 
            onClick={() => setActiveFile('py')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-medium border-t border-l border-r ${activeFile === 'py' ? 'bg-[#0c0c0e] border-zinc-800 text-yellow-400' : 'bg-zinc-900 border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
            <FileJson className="w-3.5 h-3.5" />
            fetch_token.py
        </button>
      </div>

      <div className="relative flex-1">
        <div className="absolute top-4 right-4 z-10">
            <button 
                onClick={handleCopy}
                className="p-2 bg-zinc-800/80 backdrop-blur hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors border border-zinc-700"
                title="Copy Code"
            >
                <Copy className="w-4 h-4" />
            </button>
        </div>
        <pre className="h-full bg-[#0c0c0e] text-zinc-300 p-6 rounded-b-lg rounded-tr-lg text-xs overflow-auto border border-zinc-800 leading-relaxed font-mono custom-scrollbar">
            <code>{activeFile === 'ts' ? tsCode : pyCode}</code>
        </pre>
      </div>
      
      <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
          <h4 className="text-yellow-500 font-bold text-sm mb-1">Architecture Note</h4>
          <p className="text-yellow-200/80 text-xs">
              This client spawns a Python subprocess to handle OAuth handshake. Ensure <code>python</code> is in your system PATH and the <code>fetch_token.py</code> script is in the same directory as your project root or properly referenced.
          </p>
      </div>
    </div>
  );
};

export default CodeViewer;