import { makeBulkActionHandler } from "@/lib/collection-handler";
import { autoConfig } from "@/lib/collections/auto";

export const POST = makeBulkActionHandler(autoConfig);
