import { makeValuationHandler } from "@/lib/valuation-handler";
import { iodConfig } from "@/lib/collections/iod";
import { iodValuationPrompt } from "@/lib/collections/iod-prompt";
import type { IoDItem } from "@/lib/types";

export const POST = makeValuationHandler<IoDItem>(iodConfig, iodValuationPrompt);
