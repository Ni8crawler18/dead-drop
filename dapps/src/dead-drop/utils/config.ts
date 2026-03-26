/**
 * Dead Drop dApp configuration.
 * These values are populated from environment variables after contract deployment.
 */
export const DEAD_DROP_CONFIG = {
  packageId: import.meta.env.VITE_DEAD_DROP_PACKAGE_ID || "",
  configId: import.meta.env.VITE_DEAD_DROP_CONFIG_ID || "",
  registryId: import.meta.env.VITE_DEAD_DROP_REGISTRY_ID || "",
  bountyBoardId: import.meta.env.VITE_DEAD_DROP_BOUNTY_BOARD_ID || "",
  worldPackageId: import.meta.env.VITE_WORLD_PACKAGE_ID || "",
  characterId: import.meta.env.VITE_CHARACTER_ID || "",
  storageUnitId: import.meta.env.VITE_STORAGE_UNIT_ID || "",
  storageOwnerCapId: import.meta.env.VITE_STORAGE_OWNER_CAP_ID || "",
};

export const MODULES = {
  CONFIG: "config",
  INTEL_MARKET: "intel_market",
  BOUNTY_BOARD: "bounty_board",
} as const;

export const CATEGORIES = [
  "coordinates",
  "fleet",
  "trade",
  "resources",
  "intel",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type IntelListing = {
  index: number;
  provider: string;
  title: string;
  category: string;
  priceTypeId: number;
  priceQuantity: number;
  expiresAtMs: number;
  status: number;
  buyer: string;
  createdAtMs: number;
};

export type Bounty = {
  index: number;
  poster: string;
  description: string;
  category: string;
  rewardTypeId: number;
  rewardQuantity: number;
  expiresAtMs: number;
  status: number;
  claimant: string;
  createdAtMs: number;
};

export type Reputation = {
  totalSales: number;
  positiveRatings: number;
  negativeRatings: number;
  totalEarningsQuantity: number;
};
