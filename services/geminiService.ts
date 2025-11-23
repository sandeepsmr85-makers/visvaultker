import { GoogleGenAI, Type } from "@google/genai";
import { Step } from "../types";

// We use Gemini here to "Simulate" what the Stagehand backend would do.
// Since we cannot run Node.js/Playwright in the browser, Gemini provides the "Reasoning" visualization.

export const generateAutomationPlan = async (prompt: string, url: string): Promise<Step[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please select one.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a Stagehand v3 automation planner. 
    Your job is to break down a high-level web automation prompt into specific Stagehand steps.
    Stagehand has 4 main primitives:
    1. GOTO (navigate to url)
    2. ACT (perform an action like click, type, scroll)
    3. OBSERVE (look at the page to find elements)
    4. EXTRACT (get data from the page)

    Given a user prompt and a starting URL, return a JSON array of steps.
    Keep descriptions concise and technical.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Start URL: ${url}\nUser Prompt: ${prompt}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING, enum: ["GOTO", "ACT", "EXTRACT", "OBSERVE"] },
              description: { type: Type.STRING },
            },
            required: ["action", "description"],
          },
        },
      },
    });

    const stepsRaw = JSON.parse(response.text || "[]");
    
    // Enrich with IDs and status
    return stepsRaw.map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substring(7),
      status: 'pending'
    }));

  } catch (error) {
    console.error("Gemini Planning Error:", error);
    // Fallback for demo purposes if API fails
    return [
      { id: '1', action: 'GOTO', description: `Navigate to ${url}`, status: 'pending' },
      { id: '2', action: 'OBSERVE', description: 'Analyze page structure for interactive elements', status: 'pending' },
      { id: '3', action: 'ACT', description: `Execute intent: ${prompt}`, status: 'pending' },
    ];
  }
};