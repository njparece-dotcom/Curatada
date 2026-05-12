import { makeBulkActionHandler } from "@/lib/collection-handler";
import { watchConfig } from "@/lib/collections/watch";

export const POST = makeBulkActionHandler(watchConfig);
