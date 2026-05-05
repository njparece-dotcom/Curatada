import { makeListHandlers } from "@/lib/collection-handler";
import { guitarConfig } from "@/lib/collections/guitar";

const handlers = makeListHandlers(guitarConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
