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

      // Step 1: Find PlayerProfile -> character_id
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

      if (!characterId) {
        // No character found — user needs onboarding
        setAssets({
          characterId: null,
          storageUnitId: null,
          ownerCapId: null,
          hasItems: false,
          loading: false,
          error: null,
        });
        return;
      }

      // Step 2: Verify the character's address matches this wallet
      const charObj = await rpcCall("sui_getObject", [characterId, { showContent: true }]);
      const charAddr = charObj?.data?.content?.fields?.character_address;
      if (charAddr && charAddr.toLowerCase() !== walletAddress.toLowerCase()) {
        // Character exists but belongs to different address — treat as no character
        setAssets({
          characterId: null,
          storageUnitId: null,
          ownerCapId: null,
          hasItems: false,
          loading: false,
          error: null,
        });
        return;
      }

      // Step 3: Find OwnerCap<StorageUnit> on the character
      const suCapType = `${pkg}::access::OwnerCap<${pkg}::storage_unit::StorageUnit>`;
      let ownerCapId: string | null = null;
      const suCaps = await rpcCall("suix_getOwnedObjects", [
        characterId,
        { filter: { StructType: suCapType }, options: { showContent: true } },
        null,
        5,
      ]);
      if (suCaps?.data?.length > 0) {
        ownerCapId = suCaps.data[0].data.objectId;

        // Get the storage unit ID from the OwnerCap's authorized_object_id
        const capFields = suCaps.data[0].data.content?.fields;
        const storageUnitId = capFields?.authorized_object_id || null;

        setAssets({
          characterId,
          storageUnitId,
          ownerCapId,
          hasItems: true,
          loading: false,
          error: null,
        });
      } else {
        // Character exists but no storage unit
        setAssets({
          characterId,
          storageUnitId: null,
          ownerCapId: null,
          hasItems: false,
          loading: false,
          error: null,
        });
      }
    } catch (e) {
      setAssets({
        characterId: null,
        storageUnitId: null,
        ownerCapId: null,
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
