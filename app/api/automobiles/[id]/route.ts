import { makeItemHandlers } from "@/lib/collection-handler";
import { autoConfig } from "@/lib/collections/auto";

export const dynamic = "force-dynamic";

const handlers = makeItemHandlers(autoConfig);
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
