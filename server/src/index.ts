import express from "express";
import cors from "cors";
import { env } from "./config/env";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

// Liveness endpoint. Render and the cron-job pinger will hit this.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "apparelflow-server",
    timestamp: new Date().toISOString(),
  });
});

app.listen(env.PORT, () => {
  console.log(
    `[server] ApparelFlow API listening on http://localhost:${env.PORT}`,
  );
});
