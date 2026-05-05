import { makeItemHandlers } from "@/lib/collection-handler";
import { iodConfig } from "@/lib/collections/iod";

export const dynamic = "force-dynamic";

const handlers = makeItemHandlers(iodConfig);
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
