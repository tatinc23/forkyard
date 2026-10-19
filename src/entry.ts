// Worker entry: Primitive webhook first, everything else is the existing ForkYard app (src/index.ts, unchanged).
import app from "./index";
import { handlePrimitiveWebhook } from "./primitive/webhook";
import type { Env } from "./env";

export { Hall, Job, Desk } from "./index";

export default {
	fetch(req: Request, env: Env, ctx: ExecutionContext) {
		if (new URL(req.url).pathname === "/webhooks/primitive") return handlePrimitiveWebhook(req, env, ctx);
		return app.fetch(req, env, ctx);
	},
};
