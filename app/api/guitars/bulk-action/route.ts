import { makeBulkActionHandler } from "@/lib/collection-handler";
import { guitarConfig } from "@/lib/collections/guitar";

export const POST = makeBulkActionHandler(guitarConfig);
