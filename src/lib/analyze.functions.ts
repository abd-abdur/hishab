import { createServerFn } from "@tanstack/react-start";
import { streamText, Output, NoObjectGeneratedError } from "ai";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  AnalysisSchema,
  AnalyzeInput,
  ANALYST_SYSTEM_PROMPT,
  type SpendingAnalysis,
} from "./analysis-schema";

export const analyzeStatement = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data }): Promise<SpendingAnalysis> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const text = data.text.slice(0, 120000);

    try {
      const result = streamText({
        model: gateway("google/gemini-3.7-flash"),
        system: ANALYST_SYSTEM_PROMPT,
        output: Output.object({ schema: AnalysisSchema }),
        maxOutputTokens: 12000,
        prompt: `Statement text:\n\n${text}`,
      });
      return (await result.output) as SpendingAnalysis;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        const cleaned = error.text.replace(/^```json\s*/i, "").replace(/```$/, "");
        return AnalysisSchema.parse(JSON.parse(cleaned));
      }
      throw error;
    }
  });
