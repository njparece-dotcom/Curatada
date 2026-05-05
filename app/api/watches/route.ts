import { makeListHandlers } from "@/lib/collection-handler";
import { watchConfig } from "@/lib/collections/watch";

const handlers = makeListHandlers(watchConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
