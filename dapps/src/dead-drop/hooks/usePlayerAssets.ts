import { useEffect, useState, useCallback } from "react";
import { DEAD_DROP_CONFIG } from "../utils/config";

const RPC_URL =
  import.meta.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export type PlayerAssets = {
  characterId: string | null;
  storageUnitId: string | null;
  ownerCapId: string | null;
  hasItems: boolean;
  loading: boolean;
  error: string | null;
};

/**
 * Auto-discover the connected wallet's EVE Frontier Character, StorageUnit, and OwnerCap.
 * Searches owned objects by type from our world package.
 */
export function usePlayerAssets(walletAddress: string | undefined): PlayerAssets {
  const [assets, setAssets] = useState<PlayerAssets>({
    characterId: null,
    storageUnitId: null,
    ownerCapId: null,
    hasItems: false,
    loading: false,
    error: null,
  });

  const discover = useCallback(async () => {
    if (!walletAddress || !DEAD_DROP_CONFIG.packageId) {
      setAssets((prev) => ({ ...prev, loading: false }));
      return;
    }

    setAssets((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const pkg = DEAD_DROP_CONFIG.packageId;

      // Find PlayerProfile -> Character ID
      const profileType = `${pkg}::character::PlayerProfile`;
      const profileResult = await rpcCall("suix_getOwnedObjects", [
        walletAddress,
        { filter: { StructType: profileType }, options: { showContent: true } },
        null,
        1,
      ]);

      let characterId: string | null = null;
      const profiles = profileResult?.data || [];
      if (profiles.length > 0) {
        const fields = profiles[0]?.data?.content?.fields;
        characterId = fields?.character_id || null;
      }

      // Find OwnerCap<StorageUnit> owned by the character
      // OwnerCaps are stored ON the character via Receiving, so we look for them
      // owned by the wallet directly as well
      const ownerCapType = `${pkg}::access::OwnerCap<${pkg}::storage_unit::StorageUnit>`;
      let ownerCapId: string | null = null;

      // Try to find OwnerCap from wallet's owned objects
      const ownerCapResult = await rpcCall("suix_getOwnedObjects", [
        walletAddress,
        { filter: { StructType: ownerCapType }, options: { showContent: true } },
        null,
        5,
      ]);

      const caps = ownerCapResult?.data || [];
      if (caps.length > 0) {
        ownerCapId = caps[0]?.data?.objectId || null;
      }

      // If no OwnerCap on wallet, check if we have a fallback from env
      if (!ownerCapId && DEAD_DROP_CONFIG.storageOwnerCapId) {
        ownerCapId = DEAD_DROP_CONFIG.storageOwnerCapId;
      }

      // Use env fallbacks for character and storage if not found via wallet
      if (!characterId && DEAD_DROP_CONFIG.characterId) {
        characterId = DEAD_DROP_CONFIG.characterId;
      }

      const storageUnitId = DEAD_DROP_CONFIG.storageUnitId || null;

      setAssets({
        characterId,
        storageUnitId,
        ownerCapId,
        hasItems: true, // Assume items exist; the tx will fail gracefully if not
        loading: false,
        error: null,
      });
    } catch (e) {
      setAssets({
        characterId: DEAD_DROP_CONFIG.characterId || null,
        storageUnitId: DEAD_DROP_CONFIG.storageUnitId || null,
        ownerCapId: DEAD_DROP_CONFIG.storageOwnerCapId || null,
        hasItems: false,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to discover assets",
      });
    }
  }, [walletAddress]);

  useEffect(() => {
    discover();
  }, [discover]);

  return assets;
}
