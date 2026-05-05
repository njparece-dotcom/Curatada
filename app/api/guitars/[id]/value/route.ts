import { makeValuationHandler } from "@/lib/valuation-handler";
import { guitarConfig } from "@/lib/collections/guitar";
import { guitarValuationPrompt } from "@/lib/collections/guitar-prompt";
import type { GuitarItem } from "@/lib/types";

export const POST = makeValuationHandler<GuitarItem>(guitarConfig, guitarValuationPrompt);
