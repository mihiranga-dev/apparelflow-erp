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

const app = express();

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

// 404 fallback for unknown routes.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler. Four-argument signature is mandatory.
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
