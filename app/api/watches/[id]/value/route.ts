import { makeValuationHandler } from "@/lib/valuation-handler";
import { watchConfig } from "@/lib/collections/watch";
import { watchValuationPrompt } from "@/lib/collections/watch-prompt";
import type { WatchItem } from "@/lib/types";

export const POST = makeValuationHandler<WatchItem>(watchConfig, watchValuationPrompt);
