import { makeValuationHandler } from "@/lib/valuation-handler";
import { autoConfig } from "@/lib/collections/auto";
import { autoValuationPrompt } from "@/lib/collections/auto-prompt";
import type { AutoItem } from "@/lib/types";

export const POST = makeValuationHandler<AutoItem>(autoConfig, autoValuationPrompt);
