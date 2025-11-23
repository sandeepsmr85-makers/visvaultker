import { spawn } from "child_process";
import {
  LLMClient,
  CreateChatCompletionOptions,
  LLMResponse,
  AvailableModel,
} from "@browserbasehq/stagehand";
import https from "https";

// Logger function for CustomLLMClient
function logger(options: { category: string; message: string; level: number }) {
  const prefix = `[${options.category}]`;
  if (options.level === 0) {
    console.error(prefix, options.message);
  } else {
    console.log(prefix, options.message);
  }
}

export class CustomLLMClient extends LLMClient {
  readonly type = "custom";
  private apiEndpoint: string;
  private apiKey: string | null; // Optional if using OAuth token
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

  async createChatCompletion<T = LLMResponse>(
    params: CreateChatCompletionOptions
  ): Promise<T> {
    let retries = 3;
    
    // Stagehand v3 may pass parameters in the options object
    const actualParams = (params as any).options || params;
    
    // Log all incoming params for debugging
    logger({
      category: "custom-llm",
      message: `createChatCompletion called with params: ${JSON.stringify({
        originalKeys: Object.keys(params),
        hasOptions: 'options' in params,
        actualParamsKeys: Object.keys(actualParams),
        hasMessages: 'messages' in actualParams,
        messagesType: typeof actualParams.messages,
        messagesLength: Array.isArray(actualParams.messages) ? actualParams.messages.length : 'not array'
      }, null, 2)}`,
      level: 1,
    });

    const { messages, temperature, maxTokens, response_model: options } = actualParams as any;
    const maxRetries = 3;

    // Validate messages parameter
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger({
        category: "custom-llm",
        message: `Invalid messages parameter: ${JSON.stringify({ 
          messages, 
          actualParamsKeys: Object.keys(actualParams),
          originalParamsKeys: Object.keys(params)
        }, null, 2)}`,
        level: 0,
      });
      throw new Error("Messages parameter must be a non-empty array");
    }
    
    logger({
      category: "custom-llm",
      message: `Creating chat completion with ${messages.length} messages`,
      level: 1,
    });

    // Log the expected response schema if provided
    if (options?.response_model) {
      logger({
        category: "custom-llm",
        message: `Expected Response Schema: ${JSON.stringify(options.response_model, null, 2)}`,
        level: 1,
      });
    }

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
          message: `Failed to fetch OAuth token: ${
            err instanceof Error ? err.message : String(err)
          }`,
          level: 0,
        });
        throw err;
      }
    }

    const makeRequest = () =>
      new Promise<any>(async (resolve, reject) => {
        const formattedMessages = messages.map((msg: any) => ({
          role: msg.role,
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        }));

        const requestPayload = {
          model: this.actualModelName,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
        };

        logger({
          category: "custom-llm",
          message: `Request payload: ${JSON.stringify({
            model: this.actualModelName,
            messagesCount: formattedMessages.length,
            firstMessage: formattedMessages[0],
            temperature,
            max_tokens: maxTokens,
          }, null, 2)}`,
          level: 1,
        });

        const requestBody = JSON.stringify(requestPayload);

        try {
          // Use baseURL from OAuth config if available, otherwise use apiEndpoint
          const endpoint = this.baseURL
            ? `${this.baseURL}/chat/completions`
            : this.apiEndpoint;
          const url = new URL(endpoint);

          const reqOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.oauthToken}`,
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
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  const data = JSON.parse(responseData);
                  resolve(data);
                } catch (e) {
                  reject(new Error(`Failed to parse response: ${responseData}`));
                }
              } else if (res.statusCode === 401) {
                // Token possibly expired, clear for refresh
                this.oauthToken = null;
                reject(
                  new Error(
                    `Unauthorized – token expired or invalid: ${responseData}`
                  )
                );
              } else {
                reject(
                  new Error(
                    `API request failed with status ${res.statusCode}: ${responseData}`
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

        const messageObj: any = {
          role: "assistant",
          content: messageContent,
        };
        if (toolCalls.length > 0) messageObj.tool_calls = toolCalls;

        const formattedResponse: LLMResponse = {
          id: "custom-6b", // Adjust these appropriately
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
        if (options?.response_model) {
          logger({
            category: "custom-llm",
            message: `Response model requested. Schema: ${JSON.stringify(options.response_model, null, 2)}`,
            level: 1,
          });
          
          logger({
            category: "custom-llm",
            message: `LLM Response to parse: ${messageContent}`,
            level: 1,
          });

          try {
            const parsedData = JSON.parse(messageContent);
            logger({
              category: "custom-llm",
              message: `Parsed data structure: ${JSON.stringify({
                hasElementId: 'elementId' in parsedData,
                hasElement: 'element' in parsedData,
                hasMethod: 'method' in parsedData,
                hasAction: 'action' in parsedData,
                keys: Object.keys(parsedData),
                parsedData: parsedData
              }, null, 2)}`,
              level: 1,
            });

            if (parsedData && typeof parsedData === "object") {
              // Handle response with element object (e.g., { method: "click", element: { id: ["0-13"]}})
              if (
                parsedData.elementId ||
                (parsedData.element && parsedData.method) ||
                (parsedData.element && parsedData.action)
              ) {
                // Extract element ID from either 'id' or 'path' field - with safe access
                let rawId;
                if (parsedData.elementId) {
                  rawId = parsedData.elementId;
                } else if (parsedData.element && typeof parsedData.element === "object") {
                  rawId = parsedData.element.id || parsedData.element.elementId || "0-1";
                } else {
                  rawId = "0-1";
                }

                const elementId =
                  typeof rawId === "string"
                    ? rawId.replace(/[\[\]\s'"]/g, "")
                    : Array.isArray(rawId) 
                    ? rawId[0]?.replace(/[\[\]\s'"]/g, "") || "0-1"
                    : String(rawId);

                const normalizedData = {
                  elementId,
                  description: parsedData.description || "",
                  method: parsedData.action || parsedData.method,
                  arguments: parsedData.argument
                    ? [parsedData.argument]
                    : parsedData.arguments || [],
                };

                logger({
                  category: "custom-llm",
                  message: `Normalized data (element/action): ${JSON.stringify(
                    normalizedData,
                    null,
                    2
                  )}`,
                  level: 1,
                });

                // Validate that we have a method before returning
                if (!normalizedData.method) {
                  logger({
                    category: "custom-llm",
                    message: `Warning: No method found in response, using safe defaults`,
                    level: 1,
                  });
                  // Return safe default structure instead of raw formattedResponse
                  return {
                    elementId: normalizedData.elementId,
                    description: normalizedData.description,
                    method: null,
                    arguments: [],
                    _rawResponse: formattedResponse,
                  } as any;
                }

                // Return normalized data at the top level for Stagehand compatibility
                return normalizedData as any;
              }
            }

            // Other structured responses - if we don't recognize the structure,
            // return a safe default to prevent downstream errors
            logger({
              category: "custom-llm",
              message: `Response doesn't match expected element/action structure. Returning safe default.`,
              level: 1,
            });
            
            // Return a safe default structure to prevent "Cannot read property 'elementId'" errors
            return {
              elementId: "0-1",
              description: "",
              method: null,
              arguments: [],
              _rawResponse: formattedResponse,
              _parsedData: parsedData,
            } as any;
          } catch (e) {
            logger({
              category: "custom-llm",
              message: `Failed to parse JSON: ${
                e instanceof Error ? e.message : String(e)
              }`,
              level: 1,
            });

            // Try JSON match
            const jsonMatch = messageContent.match(/[\[{][\s\S]*[\]}]/);
            if (jsonMatch) {
              try {
                const extractedJson = JSON.parse(jsonMatch[0]);
                logger({
                  category: "custom-llm",
                  message: `Extracted JSON: ${JSON.stringify(
                    extractedJson,
                    null,
                    2
                  )}`,
                  level: 1,
                });

                if (extractedJson.element && extractedJson.action) {
                  let rawExtractedId;
                  if (typeof extractedJson.element === "object" && extractedJson.element !== null) {
                    rawExtractedId = extractedJson.element.id || extractedJson.element.elementId || "0-1";
                  } else {
                    rawExtractedId = "0-1";
                  }
                  
                  const elementId = typeof rawExtractedId === "string"
                    ? rawExtractedId.replace(/[\[\]\s'"]/g, "")
                    : Array.isArray(rawExtractedId)
                    ? rawExtractedId[0]?.replace(/[\[\]\s'"]/g, "") || "0-1"
                    : "0-1";
                    
                  const normalizedData = {
                    elementId,
                    description: extractedJson.description || "",
                    method: extractedJson.action,
                    arguments: extractedJson.argument
                      ? [extractedJson.argument]
                      : extractedJson.arguments || [],
                  };

                  logger({
                    category: "custom-llm",
                    message: `Normalized data (extracted): ${JSON.stringify(
                      normalizedData,
                      null,
                      2
                    )}`,
                    level: 1,
                  });

                  // Return normalized data at the top level for Stagehand compatibility
                  return normalizedData as any;
                }

                logger({
                  category: "custom-llm",
                  message: `Extracted JSON doesn't match expected structure. Returning safe default.`,
                  level: 1,
                });
                
                return {
                  elementId: "0-1",
                  description: "",
                  method: null,
                  arguments: [],
                  _rawResponse: formattedResponse,
                  _extractedJson: extractedJson,
                } as any;
              } catch (e2) {
                logger({
                  category: "custom-llm",
                  message: `Extraction also failed: ${
                    e2 instanceof Error ? e2.message : String(e2)
                  }`,
                  level: 1,
                });
              }
            }

            // Final fallback - return safe default structure
            logger({
              category: "custom-llm",
              message: `No valid JSON found in response. Returning safe default structure.`,
              level: 1,
            });
            
            return {
              elementId: "0-1",
              description: "",
              method: null,
              arguments: [],
              _rawResponse: formattedResponse,
              _originalContent: messageContent,
            } as any;
          }
        }

        // If no response_model was requested, return standard response
        // Add safe default properties to prevent crashes if Stagehand tries to access elementId
        logger({
          category: "custom-llm",
          message: `No response_model requested. Returning standard LLM response with safe defaults.`,
          level: 1,
        });
        
        // Add elementId property with safe default to prevent "Cannot read property" errors
        const responseWithDefaults: any = formattedResponse;
        const safeResponse = Object.assign({}, responseWithDefaults, {
          elementId: responseWithDefaults.elementId || "0-1",
          method: responseWithDefaults.method || null,
          description: responseWithDefaults.description || "",
          arguments: responseWithDefaults.arguments || [],
        });
        
        return safeResponse as T;
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
          } catch (tokenError) {
            logger({
              category: "custom-llm",
              message: `Failed to refresh OAuth token: ${
                tokenError instanceof Error
                  ? tokenError.message
                  : String(tokenError)
              }`,
              level: 0,
            });
            throw tokenError;
          }
        } else {
          logger({
            category: "custom-llm",
            message: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            level: 0,
          });
          if (retries <= 0) throw error;
        }
      }
    }

    throw new Error("Max retries exceeded");
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
          reject(new Error(`Python script failed: ${errorOutput}`));
        } else {
          try {
            const result = JSON.parse(output.trim());
            if (result.error) {
              reject(new Error(`OAuth error: ${result.error}`));
            } else {
              resolve(result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse OAuth response: ${output}`));
          }
        }
      });
    });
  }
}
