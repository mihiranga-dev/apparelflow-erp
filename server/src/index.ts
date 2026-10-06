import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { env } from "./config/env";
import authRouter from "./routes/auth";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

// Liveness endpoint — Render + cron pinger hit this.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "apparelflow-server",
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);

// 404 fallback for unknown routes.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler. Four-argument signature is mandatory — Express
// uses arity to distinguish error handlers from normal middleware.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});

app.listen(env.PORT, () => {
  console.log(
    `[server] ApparelFlow API listening on http://localhost:${env.PORT}`,
  );
});
