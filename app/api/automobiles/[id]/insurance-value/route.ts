import { makeInsuranceValueHandler } from "@/lib/valuation-handler";
import { autoConfig } from "@/lib/collections/auto";
import type { AutoItem } from "@/lib/types";

export const POST = makeInsuranceValueHandler<AutoItem>(autoConfig);
