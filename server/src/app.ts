import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import authRouter from "./routes/auth";
import recipesRouter from "./routes/recipes";
import ordersRouter from "./routes/orders";
import verificationItemsRouter from "./routes/verification-items";
import verificationRouter from "./routes/verification";
import sewingRouter from "./routes/sewing";

/**
 * Factory rather than a module-level singleton so tests can create a fresh
 * app per test file — including a fresh in-memory rate-limiter state, so
 * auth tests don't consume the production-like login budget.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  );

  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "apparelflow-server",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/auth", authRouter);
  app.use("/api/recipes", recipesRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/verification-items", verificationItemsRouter);
  app.use("/api/verification", verificationRouter);
  app.use("/api/sewing", sewingRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const anyErr = err as {
      status?: number;
      statusCode?: number;
      type?: string;
      message?: string;
    };
    const status = anyErr.status ?? anyErr.statusCode ?? 500;

    if (anyErr.type === "entity.parse.failed") {
      res.status(400).json({ error: "Malformed JSON body" });
      return;
    }
    if (anyErr.type === "entity.too.large") {
      res.status(413).json({ error: "Request body too large" });
      return;
    }

    // Silenced in test runs to keep the output readable; only log real 5xx.
    if (env.NODE_ENV !== "test" && status >= 500) {
      console.error("[error]", err);
    }

    const message =
      err instanceof Error ? err.message : "Internal server error";
    const body =
      env.NODE_ENV === "production"
        ? { error: "Internal server error" }
        : { error: message };
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  });

  return app;
}
