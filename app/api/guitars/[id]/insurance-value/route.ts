import { makeInsuranceValueHandler } from "@/lib/valuation-handler";
import { guitarConfig } from "@/lib/collections/guitar";
import type { GuitarItem } from "@/lib/types";

export const POST = makeInsuranceValueHandler<GuitarItem>(guitarConfig);
