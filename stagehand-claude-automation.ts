import { Stagehand } from "@browserbasehq/stagehand";
import { execSync } from "child_process";
import * as readline from "readline";

// ──────────────────────────────────────────────
// CONFIG — Stagehand v3.2.1 (docs-verified)
// Model format: "anthropic/claude-sonnet-4-6"
// Custom gateway via model.baseURL  (official pattern)
// ──────────────────────────────────────────────

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
    console.log("🌐 Base URL         :", result.baseURL);
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
  // 1. Get OAuth token from Python fetcher
  const tokenData = fetchOAuthToken();
  const { access_token, baseURL } = tokenData;

  // 2. Get URL + task from user
  const startUrl   = await askQuestion("Enter the starting URL (e.g. https://google.com): ");
  const userPrompt = await askQuestion("Enter your automation task: ");

  console.log("\n🚀 Starting Stagehand v3.2.1");
  console.log("🤖 Model     : anthropic/claude-sonnet-4-6 (us cross-region)");
  console.log("🌐 URL       :", startUrl);
  console.log("📋 Task      :", userPrompt);
  console.log("─".repeat(60));

  // 3. Init Stagehand — official v3 pattern for custom Anthropic endpoint
  //    docs: https://docs.stagehand.dev/v3/configuration/models#custom-endpoints
  const stagehand = new Stagehand({
    env:     "LOCAL",
    verbose: 1,
    headless: false,
    model: {
      modelName: "anthropic/claude-sonnet-4-6",  // ✅ provider/model format (v3 docs)
      apiKey:    access_token,                    // OAuth Bearer token as the API key
      baseURL:   baseURL,                          // ✅ your gateway, not api.anthropic.com
    },
  });

  await stagehand.init();

  // v3 docs: use stagehand.page (not stagehand.context.pages()[0])
  const page = stagehand.page;

  try {
    // 4. Navigate
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log("\n✅ Page loaded:", startUrl);

    // 5. Act — execute the user's task
    console.log("\n🤖 Executing task with Claude...\n");
    const actionResult = await stagehand.act(userPrompt);
    console.log("📊 Action result:", actionResult);

    // 6. Observe — what's on the page now
    console.log("\n🔍 Observing page state...");
    const observations = await stagehand.observe(
      `What is visible on the page after completing: "${userPrompt}"?`
    );
    console.log("👁  Observations:", observations);

    // 7. Extract — pull structured results
    console.log("\n📦 Extracting results...");
    const extracted = await stagehand.extract(
      `Based on the task "${userPrompt}", extract the most relevant information from the current page.`
    );

    // 8. Final output
    console.log("\n" + "═".repeat(60));
    console.log("✅  TASK COMPLETE");
    console.log("═".repeat(60));
    console.log("📄 Extracted  :", extracted);
    console.log("🔗 Final URL  :", page.url());

  } catch (error) {
    console.error("\n❌ Automation error:", error);
  } finally {
    await new Promise((r) => setTimeout(r, 5000));
    await stagehand.close();
    console.log("\n👋 Browser closed.");
  }
}

main().catch(console.error);
