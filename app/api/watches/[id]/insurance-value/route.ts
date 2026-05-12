import { makeInsuranceValueHandler } from "@/lib/valuation-handler";
import { watchConfig } from "@/lib/collections/watch";
import type { WatchItem } from "@/lib/types";

export const POST = makeInsuranceValueHandler<WatchItem>(watchConfig);
