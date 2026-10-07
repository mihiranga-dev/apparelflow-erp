import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { env } from "./config/env";
import authRouter from "./routes/auth";
import recipesRouter from "./routes/recipes";
import ordersRouter from "./routes/orders";
import verificationItemsRouter from "./routes/verification-items";
import verificationRouter from "./routes/verification";
import sewingRouter from "./routes/sewing";
import helmet from "helmet";

const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(
  helmet({
    // The client is on a different origin (Netlify ↔ Render). The default
    // same-origin CORP header blocks cross-site subresource loads, which we
    // don't use — but the stricter default is unnecessary here. `cross-origin`
    // is the correct policy for a public JSON API consumed by an SPA.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // API responses are JSON — no scripts, styles, or framing. CSP would only
    // matter for HTML-server responses, so we disable it here and keep the
    // other helmet defaults (X-Content-Type-Options, frameguard, etc.).
    contentSecurityPolicy: false,
  }),
);

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

// 404 fallback for unknown routes.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler. Four-argument signature is mandatory — Express uses
// arity to distinguish error handlers from normal middleware.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Body-parser errors (malformed JSON, oversized payloads) carry a `status`
  // and `type` we should honor. Returning 500 for a client's broken JSON is
  // both wrong and reveals nothing useful — surface the real code.
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

  console.error("[error]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  // Only expose internal error messages in development. In production,
  // return a generic message so we never leak stack traces or SQL fragments.
  const body =
    env.NODE_ENV === "production"
      ? { error: "Internal server error" }
      : { error: message };
  res.status(status >= 400 && status < 600 ? status : 500).json(body);
});

app.listen(env.PORT, () => {
  console.log(
    `[server] ApparelFlow API listening on http://localhost:${env.PORT}`,
  );
});
