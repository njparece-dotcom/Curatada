import { makeInsuranceValueHandler } from "@/lib/valuation-handler";
import { iodConfig } from "@/lib/collections/iod";
import type { IoDItem } from "@/lib/types";

export const POST = makeInsuranceValueHandler<IoDItem>(iodConfig);
