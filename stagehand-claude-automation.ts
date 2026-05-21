import { Stagehand, AISdkClient } from "@browserbasehq/stagehand";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { execSync } from "child_process";
import * as readline from "readline";

// ──────────────────────────────────────────────
// MODEL — AWS Bedrock cross-region inference ID
// ──────────────────────────────────────────────
const MODEL_ID = "us.anthropic.claude-sonnet-4-6";

// ──────────────────────────────────────────────
// STEP 1 — Fetch OAuth token via Python script
// ──────────────────────────────────────────────
interface TokenResult {
  access_token: string;
  baseURL:      string;
}

function fetchOAuthToken(): TokenResult {
  console.log("🔐 Fetching OAuth token via Python...");
  try {
    const output = execSync("python3 token_fetcher.py", {
      env: {
        ...process.env,
        OAUTH_TOKEN_URL:     process.env.OAUTH_TOKEN_URL!,
        OAUTH_CLIENT_ID:     process.env.OAUTH_CLIENT_ID!,
        OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET!,
        OAUTH_GRANT_TYPE:    process.env.OAUTH_GRANT_TYPE || "client_credentials",
        OAUTH_SCOPE:         process.env.OAUTH_SCOPE     || "",
        GW_BASE_URL:         process.env.GW_BASE_URL!,
      },
    }).toString().trim();

    const result: TokenResult = JSON.parse(output);
    console.log("✅ Token fetched successfully");
    console.log("🌐 Base URL :", result.baseURL);
    return result;
  } catch (err) {
    console.error("❌ Failed to fetch OAuth token:", err);
    throw err;
  }
}

// ──────────────────────────────────────────────
// STEP 2 — CLI input helper
// ──────────────────────────────────────────────
async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────
async function main() {
  // 1. Get OAuth token
  const tokenData = fetchOAuthToken();
  const { access_token, baseURL } = tokenData;

  // 2. Get URL + task from user
  const startUrl   = await askQuestion("Enter the starting URL (e.g. https://google.com): ");
  const userPrompt = await askQuestion("Enter your automation task: ");

  console.log("\n🚀 Starting Stagehand v3.2.1");
  console.log("🤖 Model  :", MODEL_ID);
  console.log("🌐 URL    :", startUrl);
  console.log("📋 Task   :", userPrompt);
  console.log("─".repeat(60));

  // 3. Build Amazon Bedrock provider
  //    - baseURL points to your OAuth gateway (not AWS directly)
  //    - fetch is overridden to inject "Authorization: Bearer <token>"
  //    - us.anthropic.* model IDs are natively supported by @ai-sdk/amazon-bedrock
  const bedrockProvider = createAmazonBedrock({
    region:          process.env.AWS_REGION || "us-east-1",
    accessKeyId:     "placeholder",      // not used — gateway handles AWS auth
    secretAccessKey: "placeholder",      // not used — gateway handles AWS auth
    bedrockOptions: {
      endpoint:  { url: new URL(baseURL) }, // ✅ route to your gateway
    },
    // ✅ Inject Bearer token on every request via custom fetch
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${access_token}`);
      return fetch(input, { ...init, headers });
    },
  });

  // 4. Wrap in AISdkClient for Stagehand
  const llmClient = new AISdkClient({
    model: bedrockProvider(MODEL_ID),   // ✅ us.anthropic.claude-sonnet-4-6
  });

  // 5. Init Stagehand
  const stagehand = new Stagehand({
    env:      "LOCAL",
    verbose:  1,
    headless: false,
    llmClient,
  });

  await stagehand.init();
  const page = await stagehand.context.newPage();

  try {
    // 6. Navigate
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log("\n✅ Page loaded:", startUrl);

    // 7. Act
    console.log("\n🤖 Executing task with Claude...\n");
    const actionResult = await stagehand.act(userPrompt);
    console.log("📊 Action result:", actionResult);

    // 8. Observe
    console.log("\n🔍 Observing page state...");
    const observations = await stagehand.observe(
      `What is visible on the page after completing: "${userPrompt}"?`
    );
    console.log("👁  Observations:", observations);

    // 9. Extract
    console.log("\n📦 Extracting results...");
    const extracted = await stagehand.extract(
      `Based on the task "${userPrompt}", extract the most relevant information from the current page.`
    );

    // 10. Final output
    console.log("\n" + "═".repeat(60));
    console.log("✅  TASK COMPLETE");
    console.log("═".repeat(60));
    console.log("📄 Extracted :", extracted);
    console.log("🔗 Final URL :", page.url());

  } catch (error) {
    console.error("\n❌ Automation error:", error);
  } finally {
    await new Promise((r) => setTimeout(r, 5000));
    await stagehand.close();
    console.log("\n👋 Browser closed.");
  }
}

main().catch(console.error);
