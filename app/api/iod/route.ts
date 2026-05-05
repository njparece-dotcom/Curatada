import { makeListHandlers } from "@/lib/collection-handler";
import { iodConfig } from "@/lib/collections/iod";

export const dynamic = "force-dynamic";

const handlers = makeListHandlers(iodConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
