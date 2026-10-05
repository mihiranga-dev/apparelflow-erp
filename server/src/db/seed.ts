/**
 * Idempotent seed script.
 *
 * Seeds:
 *   - 3 demo users, one per role, all sharing the same demo password
 *   - 2 production recipes with their complete component lists
 *
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { users, recipes, recipeComponents } from "./schema";
import type { UserRole } from "@apparelflow/shared";

// Same password for all three demo personas keeps the evaluator workflow frictionless.
const DEMO_PASSWORD = "Password123";

const DEMO_USERS: Array<{
  email: string;
  fullName: string;
  role: UserRole;
}> = [
  {
    email: "supervisor@apparelflow.com",
    fullName: "Nimal Bandara",
    role: "cutting_supervisor",
  },
  {
    email: "verifier@apparelflow.com",
    fullName: "Kamal Perera",
    role: "cutting_verifier",
  },
  {
    email: "sewing@apparelflow.com",
    fullName: "Sunil Perera",
    role: "sewing_supervisor",
  },
];

// Recipe definitions.
const RECIPE_DEFS = [
  {
    recipeCode: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    stdFabricYards: 1.8,
    wastageCap: 5.0,
    components: [
      { componentName: "Front Body Panel", piecesPerGarment: 1 },
      { componentName: "Back Body Panel", piecesPerGarment: 1 },
      { componentName: "Sleeves (Left & Right)", piecesPerGarment: 2 },
      { componentName: "Collar & Stand", piecesPerGarment: 1 },
      { componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
    ],
  },
  {
    recipeCode: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    stdFabricYards: 1.1,
    wastageCap: 8.0,
    components: [
      { componentName: "Front Chest Panel", piecesPerGarment: 1 },
      { componentName: "Back Support Panel", piecesPerGarment: 1 },
      { componentName: "Neck Binding Strip", piecesPerGarment: 1 },
      { componentName: "Hem Elastic Casing", piecesPerGarment: 1 },
      { componentName: "Side Strap Accents", piecesPerGarment: 2 },
    ],
  },
] as const;

async function seedUsers(): Promise<void> {
  console.log("[seed] users…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of DEMO_USERS) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, u.email))
      .limit(1);
    if (existing.length > 0) {
      console.log(`  · skip (exists): ${u.email}`);
      continue;
    }
    await db.insert(users).values({
      email: u.email,
      passwordHash,
      role: u.role,
      fullName: u.fullName,
    });
    console.log(`  ✓ created: ${u.email} [${u.role}]`);
  }
}

async function seedRecipes(): Promise<void> {
  console.log("[seed] recipes…");

  for (const def of RECIPE_DEFS) {
    const existing = await db
      .select()
      .from(recipes)
      .where(eq(recipes.recipeCode, def.recipeCode))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  · skip (exists): ${def.recipeCode}`);
      continue;
    }

    const [insertedRecipe] = await db
      .insert(recipes)
      .values({
        recipeCode: def.recipeCode,
        name: def.name,
        category: def.category,
        stdFabricYards: def.stdFabricYards,
        wastageCap: def.wastageCap,
      })
      .returning();

    if (!insertedRecipe) {
      throw new Error(`Failed to insert recipe ${def.recipeCode}`);
    }

    await db.insert(recipeComponents).values(
      def.components.map((c) => ({
        recipeId: insertedRecipe.id,
        componentName: c.componentName,
        piecesPerGarment: c.piecesPerGarment,
      })),
    );

    console.log(
      `  ✓ created: ${def.recipeCode} (${def.components.length} components)`,
    );
  }
}

async function main(): Promise<void> {
  console.log("  ApparelFlow ERP — database seed");
  try {
    await seedUsers();
    await seedRecipes();
    console.log("  ✓ Seed complete");
    console.log("");
    console.log("Demo credentials (all roles share this password):");
    for (const u of DEMO_USERS) {
      console.log(`  ${u.role.padEnd(20)} ${u.email}  /  ${DEMO_PASSWORD}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("✗ Seed failed:", err);
    process.exit(1);
  }
}

void main();
