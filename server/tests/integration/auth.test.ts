import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { DEMO_PASSWORD, resetDatabase, seedMinimumData } from "../helpers";

const app = createApp();

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await seedMinimumData();
});

describe("POST /auth/login", () => {
  it("accepts valid credentials and returns a JWT", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "verifier@apparelflow.com", password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^eyJ/);
    expect(res.body.user.role).toBe("cutting_verifier");
  });

  it("rejects a wrong password with 401 (no role leak)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "verifier@apparelflow.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("rejects an unknown email with the same 401 message (no user enumeration)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@apparelflow.com", password: DEMO_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("rejects malformed payloads with 400", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
  });

  it("lowercases and trims emails before lookup (normalization)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "  VERIFIER@APPARELFLOW.COM  ", password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe("GET /auth/me", () => {
  it("returns the current user for a valid token", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "verifier@apparelflow.com", password: DEMO_PASSWORD });
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("cutting_verifier");
  });

  it("returns 401 for a missing token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a garbage token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a token with a tampered payload (signature mismatch)", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "verifier@apparelflow.com", password: DEMO_PASSWORD });
    const [header, payload, signature] = (login.body.token as string).split(
      ".",
    );
    const decoded = JSON.parse(Buffer.from(payload!, "base64").toString());
    decoded.role = "cutting_supervisor";
    const mutated = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const tampered = `${header}.${mutated}.${signature}`;
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/switch-role", () => {
  it("issues a new JWT for the target role", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "supervisor@apparelflow.com", password: DEMO_PASSWORD });
    const res = await request(app)
      .post("/auth/switch-role")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ role: "sewing_supervisor" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("sewing_supervisor");
  });

  it("rejects an unknown role with 400", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "supervisor@apparelflow.com", password: DEMO_PASSWORD });
    const res = await request(app)
      .post("/auth/switch-role")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ role: "plant_manager" });
    expect(res.status).toBe(400);
  });
});
