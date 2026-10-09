export const TEST_ACCOUNT_MAP: Record<string, string> = {
  seller: "test-seller@test.dostup.local",
  testseller: "test-seller@test.dostup.local",
  "test-seller": "test-seller@test.dostup.local",
  "test-seller@test.dostup.local": "test-seller@test.dostup.local",
  "продавец": "test-seller@test.dostup.local",
  "автор": "test-seller@test.dostup.local",

  buyer: "test-buyer@test.dostup.local",
  testbuyer: "test-buyer@test.dostup.local",
  "test-buyer": "test-buyer@test.dostup.local",
  "test-buyer@test.dostup.local": "test-buyer@test.dostup.local",
  "покупатель": "test-buyer@test.dostup.local",
  "ученик": "test-buyer@test.dostup.local",
};

export const TEST_ACCOUNT_PASSWORD = "test123456";

export function getTestAccountEmail(identifier: string): string | null {
  const normalized = identifier.trim().toLowerCase();
  return TEST_ACCOUNT_MAP[normalized] || null;
}
