import { useEffect, useState, useCallback } from "react";
import { DEAD_DROP_CONFIG } from "../utils/config";
import type { IntelListing } from "../utils/config";

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

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  console.log("RPC >>", method, JSON.stringify(params).slice(0, 200));
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) {
    console.error("RPC ERR <<", method, json.error);
    throw new Error(json.error.message);
  }
  return json.result;
}

export function useIntelRegistry() {
  const [listings, setListings] = useState<IntelListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    if (!DEAD_DROP_CONFIG.registryId) {
      setError("VITE_DEAD_DROP_REGISTRY_ID not configured");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const obj = await rpcCall("sui_getObject", [
        DEAD_DROP_CONFIG.registryId,
        { showContent: true },
      ]);

      if (!obj?.data?.content?.fields) {
        setError("IntelRegistry not found or empty");
        setLoading(false);
        return;
      }

      const fields = obj.data.content.fields;
      const rawListings = fields?.listings || [];

      const parsed: IntelListing[] = rawListings.map(
        (item: any, index: number) => {
          const f = item.fields || item;
          return {
            index,
            provider: f.provider || "0x0",
            title: decodeBytes(f.title),
            category: decodeBytes(f.category),
            priceTypeId: Number(f.price_type_id || 0),
            priceQuantity: Number(f.price_quantity || 0),
            expiresAtMs: Number(f.expires_at_ms || 0),
            status: Number(f.status || 0),
            buyer: f.buyer || "0x0",
            createdAtMs: Number(f.created_at_ms || 0),
          };
        },
      );

      // Newest first
      setListings(parsed.reverse());
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch listings";
      console.error("Fetch listings failed:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  return { listings, loading, error, refetch: fetchListings };
}
