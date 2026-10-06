import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { recipes } from "../db/schema";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/recipes
 * Any authenticated role. Verifiers need component names to build their
 * count form; supervisors need them for orders; sewing inspects component
 * counts in completed batches.
 */
router.get(
  "/",
  asyncHandler(requireAuth),
  asyncHandler(async (_req, res) => {
    const rows = await db.query.recipes.findMany({
      with: { components: { orderBy: [asc(recipes.createdAt)] } },
      orderBy: [asc(recipes.recipeCode)],
    });
    res.json({ recipes: rows });
  }),
);

/**
 * GET /api/recipes/:id
 */
router.get(
  "/:id",
  asyncHandler(requireAuth),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid recipe id" });
      return;
    }

    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, id),
      with: { components: true },
    });

    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }

    res.json({ recipe });
  }),
);

export default router;
