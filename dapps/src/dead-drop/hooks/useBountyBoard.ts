import { useEffect, useState, useCallback } from "react";
import { DEAD_DROP_CONFIG } from "../utils/config";
import type { Bounty } from "../utils/config";

const RPC_URL =
  import.meta.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";

function decodeBytes(arr: number[] | string | undefined): string {
  if (!arr) return "";
  if (typeof arr === "string") return arr;
  try {
    return new TextDecoder().decode(new Uint8Array(arr));
  } catch {
    return "";
  }
}

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

export function useBountyBoard() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBounties = useCallback(async () => {
    if (!DEAD_DROP_CONFIG.bountyBoardId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const obj = await rpcCall("sui_getObject", [
        DEAD_DROP_CONFIG.bountyBoardId,
        { showContent: true },
      ]);

      if (!obj?.data?.content?.fields) {
        setBounties([]);
        setLoading(false);
        return;
      }

      const fields = obj.data.content.fields;
      const rawBounties = fields?.bounties || [];

      const parsed: Bounty[] = rawBounties.map((item: any, index: number) => {
        const f = item.fields || item;
        return {
          index,
          poster: f.poster || "0x0",
          description: decodeBytes(f.description),
          category: decodeBytes(f.category),
          rewardTypeId: Number(f.reward_type_id || 0),
          rewardQuantity: Number(f.reward_quantity || 0),
          expiresAtMs: Number(f.expires_at_ms || 0),
          status: Number(f.status || 0),
          claimant: f.claimant || "0x0",
          createdAtMs: Number(f.created_at_ms || 0),
        };
      });

      setBounties(parsed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch bounties");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBounties();
  }, [fetchBounties]);

  return { bounties, loading, error, refetch: fetchBounties };
}
