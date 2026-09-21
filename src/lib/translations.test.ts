import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { translations } from "./translations";

// Resolved from the repo root: under jsdom `import.meta.url` is an http url,
// which readFileSync rejects.
function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("seller name placeholder is short name-or-title copy", () => {
  expect(translations.ru.sellerNamePlaceholder).toBe("Название или имя");
  expect(translations.kk.sellerNamePlaceholder).toBe("Атау немесе есім");
  expect(translations.ru.sellerNameLabel).toBe("Как будет видно покупателям");
  expect(translations.kk.sellerNameLabel).toBe("Сатып алушыларға қалай көрінеді");
});

test("add-profile button stays visible and both seller modes stay available", () => {
  const rows = readRepoFile("src/components/layout/ProfileAccountRows.tsx");
  expect(rows.includes("canAddSeller")).toBe(false);
  expect(rows.includes("showProfilesHeading")).toBe(false);
  expect(rows).toMatch(/\{newProfileControl\}/);

  const dialog = readRepoFile("src/components/layout/AddSellerProfileDialog.tsx");
  expect(dialog).toMatch(/const SELLER_TYPES: ProfileType\[\] = \["creator", "school"\]/);
  expect(dialog).toMatch(/types=\{SELLER_TYPES\}/);

  const switchProfile = readRepoFile("supabase/functions/switch-profile/index.ts");
  expect(switchProfile).toMatch(/createSellerProfile/);
  expect(switchProfile).not.toMatch(
    /target = await findOrCreateProfile\(supabase, authUserId!, createType, displayName\)/,
  );

  const profiles = readRepoFile("supabase/functions/_shared/profiles.ts");
  expect(profiles).toMatch(/export async function createSellerProfile/);
  expect(profiles).not.toMatch(/byAuthType/);

  const migration = readRepoFile(
    "supabase/migrations/20260829180000_allow_multiple_seller_profiles.sql",
  );
  expect(migration).toMatch(/DROP INDEX IF EXISTS public\.profiles_auth_user_id_type_idx/);
  expect(migration).toMatch(/DROP INDEX IF EXISTS public\.creator_accounts_auth_user_id_type_idx/);
  expect(migration).toMatch(/profiles_one_buyer_per_auth_user_idx|Buyer stays unique|покупатель/i);
});
