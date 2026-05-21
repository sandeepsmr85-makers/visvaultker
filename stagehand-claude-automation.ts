import { Stagehand } from "@browserbasehq/stagehand";
import { execSync } from "child_process";
import * as readline from "readline";

// ──────────────────────────────────────────────
// CONFIG — Stagehand v3.2.1
// ──────────────────────────────────────────────
const MODEL = "us.anthropic.claude-sonnet-4-6";

// ──────────────────────────────────────────────
// STEP 1 — Fetch OAuth token via Python script
// ──────────────────────────────────────────────
interface TokenResult {
  access_token: string;
  gw_base_url: string;
  token_type: string;
  expires_in: number;
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
        OAUTH_SCOPE:         process.env.OAUTH_SCOPE || "",
        GW_BASE_URL:         process.env.GW_BASE_URL!,
      },
    }).toString().trim();

    const result: TokenResult = JSON.parse(output);
    console.log("✅ Token fetched successfully");
    console.log("🌐 Gateway Base URL :", result.gw_base_url);
    console.log("⏱  Expires in       :", result.expires_in, "seconds");
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
    input: process.stdin,
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
  const { access_token, gw_base_url } = tokenData;

  // 2. Get URL + task from user
  const startUrl   = await askQuestion("Enter the starting URL (e.g. https://google.com): ");
  const userPrompt = await askQuestion("Enter your automation task: ");

  console.log("\n🚀 Starting Stagehand v3.2.1");
  console.log("🤖 Model     :", MODEL);
  console.log("🌐 URL       :", startUrl);
  console.log("📋 Task      :", userPrompt);
  console.log("─".repeat(60));

  // 3. Initialize Stagehand v3 — note: `model` is top-level in v3
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    headless: false,
    model: MODEL,                      // ✅ v3 uses `model` (not `modelName`)
    modelClientOptions: {
      baseURL: gw_base_url,            // Your OAuth-protected API gateway
      defaultHeaders: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      awsRegion: process.env.AWS_REGION || "us-east-1",
    },
  });

  await stagehand.init();

  // ✅ v3: page is accessed via stagehand.context.pages()[0]
  const page = stagehand.context.pages()[0];

  try {
    // 4. Navigate to starting URL
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log("\n✅ Page loaded:", startUrl);

    // 5. Execute task — v3 act() accepts plain string directly
    console.log("\n🤖 Executing task with Claude...\n");
    const actionResult = await stagehand.act(userPrompt);
    console.log("📊 Action result:", actionResult);

    // 6. Observe current page state
    console.log("\n🔍 Observing page state...");
    const observations = await stagehand.observe(
      `What is visible on the page after completing: "${userPrompt}"?`
    );
    console.log("👁  Observations:", observations);

    // 7. Extract structured results — v3 extract() accepts plain string
    console.log("\n📦 Extracting results...");
    const extracted = await stagehand.extract(
      `Based on the task "${userPrompt}", extract the most relevant information from the current page as a summary and key results list.`
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
