import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translations } from "./translations.ts";

test("seller name placeholder is short name-or-title copy", () => {
  assert.equal(translations.ru.sellerNamePlaceholder, "Название или имя");
  assert.equal(translations.kk.sellerNamePlaceholder, "Атау немесе есім");
  assert.equal(translations.ru.sellerNameLabel, "Как будет видно покупателям");
  assert.equal(translations.kk.sellerNameLabel, "Сатып алушыларға қалай көрінеді");
});

test("add-profile button stays visible and seller modes plus a missing buyer are offered", () => {
  const rows = readFileSync(new URL("../components/layout/ProfileAccountRows.tsx", import.meta.url), "utf8");
  assert.equal(rows.includes("canAddSeller"), false);
  assert.equal(rows.includes("showProfilesHeading"), false);
  assert.match(rows, /\{newProfileControl\}/);

  const dialog = readFileSync(
    new URL("../components/layout/AddSellerProfileDialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dialog, /const SELLER_TYPES: ProfileType\[\] = \["creator"\]/);
  assert.match(dialog, /const ALL_TYPES: ProfileType\[\] = \["buyer", \.\.\.SELLER_TYPES\]/);
  assert.match(dialog, /types=\{availableTypes\}/);

  const switchProfile = readFileSync(
    new URL("../../supabase/functions/switch-profile/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(switchProfile, /createSellerProfile/);
  // Creating a seller profile must not create a hidden buyer profile.
  assert.doesNotMatch(switchProfile, /findOrCreateProfile\(supabase, authUserId!, 'buyer'/);
  assert.doesNotMatch(
    switchProfile,
    /target = await findOrCreateProfile\(supabase, authUserId!, createType, displayName\)/,
  );

  const profiles = readFileSync(
    new URL("../../supabase/functions/_shared/profiles.ts", import.meta.url),
    "utf8",
  );
  assert.match(profiles, /export async function createSellerProfile/);
  assert.doesNotMatch(profiles, /byAuthType/);

  const migration = readFileSync(
    new URL("../../supabase/migrations/20260829180000_allow_multiple_seller_profiles.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /DROP INDEX IF EXISTS public\.profiles_auth_user_id_type_idx/);
  assert.match(migration, /DROP INDEX IF EXISTS public\.creator_accounts_auth_user_id_type_idx/);
  assert.match(migration, /profiles_one_buyer_per_auth_user_idx|Buyer stays unique|покупатель/i);
});
