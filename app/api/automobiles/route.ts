import { makeListHandlers } from "@/lib/collection-handler";
import { autoConfig } from "@/lib/collections/auto";

export const dynamic = "force-dynamic";

const handlers = makeListHandlers(autoConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
