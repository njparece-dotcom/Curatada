import { makeItemHandlers } from "@/lib/collection-handler";
import { watchConfig } from "@/lib/collections/watch";

const handlers = makeItemHandlers(watchConfig);
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
