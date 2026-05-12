import { makeBulkActionHandler } from "@/lib/collection-handler";
import { iodConfig } from "@/lib/collections/iod";

export const POST = makeBulkActionHandler(iodConfig);
