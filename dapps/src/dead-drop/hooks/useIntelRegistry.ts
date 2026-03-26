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

async function rpcCall(method: string, params: unknown[], retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) {
        if (i < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(json.error.message);
      }
      return json.result;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
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
      // Suppress transient RPC errors and retry once silently
      if (msg.includes("Invalid params") || msg.includes("AccountAddress")) {
        console.warn("RPC transient error, retrying...", msg);
        try {
          await new Promise(r => setTimeout(r, 2000));
          const obj2 = await rpcCall("sui_getObject", [
            DEAD_DROP_CONFIG.registryId,
            { showContent: true },
          ]);
          if (obj2?.data?.content?.fields) {
            const rawListings = obj2.data.content.fields.listings || [];
            const parsed: IntelListing[] = rawListings.map((item: any, index: number) => {
              const f = item.fields || item;
              return {
                index, provider: f.provider || "0x0",
                title: decodeBytes(f.title), category: decodeBytes(f.category),
                priceTypeId: Number(f.price_type_id || 0), priceQuantity: Number(f.price_quantity || 0),
                expiresAtMs: Number(f.expires_at_ms || 0), status: Number(f.status || 0),
                buyer: f.buyer || "0x0", createdAtMs: Number(f.created_at_ms || 0),
              };
            });
            setListings(parsed.reverse());
            setError(null);
            setLoading(false);
            return;
          }
        } catch { /* fall through */ }
      }
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
