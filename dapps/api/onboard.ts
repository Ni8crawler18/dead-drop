/**
 * Vercel Serverless Function: POST /api/onboard
 * Provisions an EVE Frontier character, storage unit, and items for a new wallet.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const RPC_URL = "https://fullnode.testnet.sui.io:443";
const ALLOWED_ORIGINS = [
  "https://deaddrop-intel.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const env = (key: string, fallback = ""): string =>
  ((globalThis as any).process?.env?.[key] ?? fallback).trim();

const ADMIN_PRIVATE_KEY = env("ADMIN_PRIVATE_KEY");
const WORLD_PACKAGE_ID = env("VITE_DEAD_DROP_PACKAGE_ID");
const ADMIN_ACL = env("ADMIN_ACL");
const OBJECT_REGISTRY = env("OBJECT_REGISTRY");
const ENERGY_CONFIG = env("ENERGY_CONFIG");
const NWN_ITEM_ID = env("NWN_ITEM_ID", "5550000012");
const LOCATION_HASH = env(
  "LOCATION_HASH",
  "0x16217de8ec7330ec3eac32831df5c9cd9b21a255756a5fd5762dd7f49f6cc049",
);

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.find((o) => origin.startsWith(o));
  res.setHeader("Access-Control-Allow-Origin", allowed || ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { walletAddress } = req.body || {};
  if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.startsWith("0x") || walletAddress.length !== 66) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const lastCall = rateLimitMap.get(walletAddress) || 0;
  if (Date.now() - lastCall < RATE_LIMIT_MS) {
    return res.status(429).json({ error: "Rate limited. Try again in 1 minute." });
  }
  rateLimitMap.set(walletAddress, Date.now());

  if (!ADMIN_PRIVATE_KEY) return res.status(500).json({ error: "Server not configured" });

  try {
    const { Transaction } = await import("@mysten/sui/transactions");
    const { SuiJsonRpcClient } = await import("@mysten/sui/jsonRpc");
    const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
    const { decodeSuiPrivateKey } = await import("@mysten/sui/cryptography");
    const { bcs } = await import("@mysten/sui/bcs");
    const { deriveObjectID } = await import("@mysten/sui/utils");

    const client = new SuiJsonRpcClient({ url: RPC_URL });
    const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVATE_KEY);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const adminAddr = keypair.getPublicKey().toSuiAddress();
    const pkg = WORLD_PACKAGE_ID;

    const TenantItemId = bcs.struct("TenantItemId", { id: bcs.u64(), tenant: bcs.string() });
    function deriveId(itemId: number | bigint): string {
      const key = TenantItemId.serialize({ id: BigInt(itemId), tenant: "dev" }).toBytes();
      return deriveObjectID(OBJECT_REGISTRY, `${pkg}::in_game_id::TenantItemId`, key);
    }

    // Execute transaction and wait for finality
    async function exec(tx: InstanceType<typeof Transaction>, showEvents = false) {
      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true, showEvents },
      });
      if (result.digest) {
        await client.waitForTransaction({ digest: result.digest });
      }
      return result;
    }

    const addrNum = parseInt(walletAddress.slice(2, 10), 16);
    const charGameId = 800000000 + (addrNum % 100000000);
    const storageItemId = 700000000 + (addrNum % 100000000);
    const characterId = deriveId(charGameId);
    const nwnId = deriveId(BigInt(NWN_ITEM_ID));
    const storageIdDerived = deriveId(storageItemId);

    // Check existing state
    const charObj = await rpcCall("sui_getObject", [characterId, { showContent: true }]);
    const charExists = !!charObj?.data?.content;
    const storObj = await rpcCall("sui_getObject", [storageIdDerived, { showContent: true }]);
    const storExists = !!storObj?.data?.content;

    if (charExists && storExists) {
      return res.status(200).json({
        status: "already_onboarded",
        characterId,
        storageUnitId: storageIdDerived,
        message: "Account already set up!",
      });
    }

    const locBytes = Array.from(
      new Uint8Array(LOCATION_HASH.slice(2).match(/.{2}/g)!.map((b: string) => parseInt(b, 16))),
    );

    // 1. Create character (if needed)
    if (!charExists) {
      const tx = new Transaction();
      const [c] = tx.moveCall({
        target: `${pkg}::character::create_character`,
        arguments: [
          tx.object(OBJECT_REGISTRY), tx.object(ADMIN_ACL),
          tx.pure.u32(charGameId), tx.pure.string("dev"),
          tx.pure.u32(100), tx.pure.address(walletAddress),
          tx.pure.string("dead-drop-agent"),
        ],
      });
      tx.moveCall({ target: `${pkg}::character::share_character`, arguments: [c, tx.object(ADMIN_ACL)] });
      await exec(tx);
    }

    // 2. Create storage unit (if needed)
    let storageUnitId = storageIdDerived;
    let ownerCapId = "";
    if (!storExists) {
      const tx = new Transaction();
      const [s] = tx.moveCall({
        target: `${pkg}::storage_unit::anchor`,
        arguments: [
          tx.object(OBJECT_REGISTRY), tx.object(nwnId), tx.object(characterId), tx.object(ADMIN_ACL),
          tx.pure.u64(BigInt(storageItemId)), tx.pure.u64(88082n), tx.pure.u64(1000000000000n),
          tx.pure(bcs.vector(bcs.u8()).serialize(locBytes)),
        ],
      });
      tx.moveCall({ target: `${pkg}::storage_unit::share_storage_unit`, arguments: [s, tx.object(ADMIN_ACL)] });
      const r = await exec(tx, true);
      const ev = r.events?.find((e: any) => e.type?.includes("StorageUnitCreatedEvent"));
      if (ev?.parsedJson) {
        storageUnitId = (ev.parsedJson as any).storage_unit_id || storageIdDerived;
        ownerCapId = (ev.parsedJson as any).owner_cap_id || "";
      }
    }

    if (!ownerCapId) {
      // Look up OwnerCap from character's owned objects
      const capType = `${pkg}::access::OwnerCap<${pkg}::storage_unit::StorageUnit>`;
      const caps = await rpcCall("suix_getOwnedObjects", [
        characterId, { filter: { StructType: capType }, options: { showContent: true } }, null, 1,
      ]);
      ownerCapId = caps?.data?.[0]?.data?.objectId || "";
    }

    if (!ownerCapId) {
      return res.status(500).json({ error: "Could not find OwnerCap for storage unit" });
    }

    // 3. Temporarily set character address to admin
    const tx3 = new Transaction();
    tx3.moveCall({
      target: `${pkg}::character::update_address`,
      arguments: [tx3.object(characterId), tx3.object(ADMIN_ACL), tx3.pure.address(adminAddr)],
    });
    await exec(tx3);

    // 4. Online storage unit
    const tx4 = new Transaction();
    const [c4, r4] = tx4.moveCall({
      target: `${pkg}::character::borrow_owner_cap`,
      typeArguments: [`${pkg}::storage_unit::StorageUnit`],
      arguments: [tx4.object(characterId), tx4.object(ownerCapId)],
    });
    tx4.moveCall({
      target: `${pkg}::storage_unit::online`,
      arguments: [tx4.object(storageUnitId), tx4.object(nwnId), tx4.object(ENERGY_CONFIG), c4],
    });
    tx4.moveCall({
      target: `${pkg}::character::return_owner_cap`,
      typeArguments: [`${pkg}::storage_unit::StorageUnit`],
      arguments: [tx4.object(characterId), c4, r4],
    });
    await exec(tx4);

    // 5. Deposit items (type 1 + type 2)
    for (const [uid, tid] of [[BigInt(addrNum) + 100n, 1n], [BigInt(addrNum) + 200n, 2n]]) {
      const tx = new Transaction();
      const [c, r] = tx.moveCall({
        target: `${pkg}::character::borrow_owner_cap`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [tx.object(characterId), tx.object(ownerCapId)],
      });
      tx.moveCall({
        target: `${pkg}::storage_unit::game_item_to_chain_inventory`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(storageUnitId), tx.object(ADMIN_ACL), tx.object(characterId), c,
          tx.pure.u64(uid), tx.pure.u64(tid), tx.pure.u64(10n), tx.pure.u32(100),
        ],
      });
      tx.moveCall({
        target: `${pkg}::character::return_owner_cap`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [tx.object(characterId), c, r],
      });
      await exec(tx);
    }

    // 6. Authorize DeadDropAuth
    const tx6 = new Transaction();
    const [c6, r6] = tx6.moveCall({
      target: `${pkg}::character::borrow_owner_cap`,
      typeArguments: [`${pkg}::storage_unit::StorageUnit`],
      arguments: [tx6.object(characterId), tx6.object(ownerCapId)],
    });
    tx6.moveCall({
      target: `${pkg}::storage_unit::authorize_extension`,
      typeArguments: [`${pkg}::config::DeadDropAuth`],
      arguments: [tx6.object(storageUnitId), c6],
    });
    tx6.moveCall({
      target: `${pkg}::character::return_owner_cap`,
      typeArguments: [`${pkg}::storage_unit::StorageUnit`],
      arguments: [tx6.object(characterId), c6, r6],
    });
    await exec(tx6);

    // 7. Restore character address to user
    const tx7 = new Transaction();
    tx7.moveCall({
      target: `${pkg}::character::update_address`,
      arguments: [tx7.object(characterId), tx7.object(ADMIN_ACL), tx7.pure.address(walletAddress)],
    });
    await exec(tx7);

    // 8. Send SUI for gas
    const tx8 = new Transaction();
    const [coin] = tx8.splitCoins(tx8.gas, [300000000]);
    tx8.transferObjects([coin], walletAddress);
    await exec(tx8);

    return res.status(200).json({
      status: "success",
      characterId,
      storageUnitId,
      ownerCapId,
      message: "Account provisioned! You can now buy and sell intel.",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: (error?.message || "Onboarding failed").slice(0, 200),
    });
  }
}
