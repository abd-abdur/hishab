import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "@/lib/auth-middleware";
import { CommitInputSchema } from "./draft-schema";
import { commitStatement, deleteStatement } from "./persist.server";

/** Persist a reviewed draft. The user has approved (and possibly edited) the rows. */
export const commitStatementFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(CommitInputSchema)
  .handler(async ({ data, context }) => {
    return commitStatement(context.userId, data);
  });

export const deleteStatementFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ statementId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await deleteStatement(context.userId, data.statementId);
    return { ok: true };
  });
