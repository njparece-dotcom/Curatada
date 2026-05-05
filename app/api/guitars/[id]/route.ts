import { makeItemHandlers } from "@/lib/collection-handler";
import { guitarConfig } from "@/lib/collections/guitar";

const handlers = makeItemHandlers(guitarConfig);
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
