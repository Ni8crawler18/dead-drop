/**
 * Vercel Serverless Function: POST /api/onboard
 *
 * Provisions an EVE Frontier character, storage unit, and items for a new wallet.
 * Called when a user clicks "Setup Demo Account" in the dApp.
 */

// @ts-nocheck
import type { VercelRequest, VercelResponse } from "@vercel/node";

const RPC_URL = "https://fullnode.testnet.sui.io:443";

// These come from Vercel environment variables
const ADMIN_PRIVATE_KEY = (process as any).env.ADMIN_PRIVATE_KEY || "";
const WORLD_PACKAGE_ID = (process as any).env.VITE_DEAD_DROP_PACKAGE_ID || "";
const ADMIN_ACL = (process as any).env.ADMIN_ACL || "";
const OBJECT_REGISTRY = (process as any).env.OBJECT_REGISTRY || "";
const ENERGY_CONFIG = (process as any).env.ENERGY_CONFIG || "";
const NWN_ITEM_ID = (process as any).env.NWN_ITEM_ID || "5550000012";
const LOCATION_HASH = (process as any).env.LOCATION_HASH || "0x16217de8ec7330ec3eac32831df5c9cd9b21a255756a5fd5762dd7f49f6cc049";

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { walletAddress } = req.body || {};
  if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.startsWith("0x")) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  if (!ADMIN_PRIVATE_KEY) {
    return res.status(500).json({ error: "Server not configured — missing admin key" });
  }

  try {
    // Dynamic imports for Sui SDK (serverless compatibility)
    const { Transaction } = await import("@mysten/sui/transactions");
    const { SuiJsonRpcClient: SuiClient } = await import("@mysten/sui/jsonRpc");
    const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
    const { decodeSuiPrivateKey } = await import("@mysten/sui/cryptography");
    const { bcs } = await import("@mysten/sui/bcs");
    const { deriveObjectID } = await import("@mysten/sui/utils");

    const client = new SuiClient({ url: RPC_URL });
    const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVATE_KEY);
    const adminKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

    // Derive IDs helper
    const TenantItemId = bcs.struct("TenantItemId", { id: bcs.u64(), tenant: bcs.string() });
    function deriveId(itemId: number | bigint): string {
      const key = TenantItemId.serialize({ id: BigInt(itemId), tenant: "dev" }).toBytes();
      return deriveObjectID(OBJECT_REGISTRY, `${WORLD_PACKAGE_ID}::in_game_id::TenantItemId`, key);
    }

    // Use wallet address hash for unique IDs to avoid collisions
    const addrNum = parseInt(walletAddress.slice(2, 10), 16);
    const charGameId = 800000000 + (addrNum % 100000000);
    const storageItemId = 700000000 + (addrNum % 100000000);

    const characterId = deriveId(charGameId);
    const nwnId = deriveId(BigInt(NWN_ITEM_ID));

    // Check if character already exists
    const existing = await rpcCall("sui_getObject", [characterId, { showContent: true }]);
    if (existing?.data?.content) {
      // Already onboarded — find storage unit
      const storageId = deriveId(storageItemId);
      const storageObj = await rpcCall("sui_getObject", [storageId, { showContent: true }]);
      const hasStorage = !!storageObj?.data?.content;

      return res.status(200).json({
        status: "already_onboarded",
        characterId,
        storageUnitId: hasStorage ? storageId : null,
        message: "Account already set up!",
      });
    }

    const locationBytes = Array.from(
      new Uint8Array(
        LOCATION_HASH.slice(2).match(/.{2}/g)!.map((b: string) => parseInt(b, 16))
      )
    );

    // Step 1: Create character
    const tx1 = new Transaction();
    const [character] = tx1.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::create_character`,
      arguments: [
        tx1.object(OBJECT_REGISTRY),
        tx1.object(ADMIN_ACL),
        tx1.pure.u32(charGameId),
        tx1.pure.string("dev"),
        tx1.pure.u32(100),
        tx1.pure.address(walletAddress),
        tx1.pure.string("dead-drop-agent"),
      ],
    });
    tx1.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::share_character`,
      arguments: [character, tx1.object(ADMIN_ACL)],
    });
    await client.signAndExecuteTransaction({ transaction: tx1, signer: adminKeypair });

    // Step 2: Create storage unit
    const tx2 = new Transaction();
    const [ssu] = tx2.moveCall({
      target: `${WORLD_PACKAGE_ID}::storage_unit::anchor`,
      arguments: [
        tx2.object(OBJECT_REGISTRY),
        tx2.object(nwnId),
        tx2.object(characterId),
        tx2.object(ADMIN_ACL),
        tx2.pure.u64(BigInt(storageItemId)),
        tx2.pure.u64(88082n),
        tx2.pure.u64(1000000000000n),
        tx2.pure(bcs.vector(bcs.u8()).serialize(locationBytes)),
      ],
    });
    tx2.moveCall({
      target: `${WORLD_PACKAGE_ID}::storage_unit::share_storage_unit`,
      arguments: [ssu, tx2.object(ADMIN_ACL)],
    });
    const ssuResult = await client.signAndExecuteTransaction({
      transaction: tx2, signer: adminKeypair, options: { showEvents: true },
    });

    const ssuEvent = ssuResult.events?.find((e: any) =>
      e.type?.includes("StorageUnitCreatedEvent")
    );
    const storageUnitId = (ssuEvent?.parsedJson as any)?.storage_unit_id || deriveId(storageItemId);
    const ownerCapId = (ssuEvent?.parsedJson as any)?.owner_cap_id || "";

    // Steps 3-5: Temporarily set char to admin, online + deposit + authorize, restore
    // Temporarily change character address to admin
    const tx3 = new Transaction();
    tx3.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::update_address`,
      arguments: [tx3.object(characterId), tx3.object(ADMIN_ACL), tx3.pure.address(adminAddress)],
    });
    await client.signAndExecuteTransaction({ transaction: tx3, signer: adminKeypair });

    // Online storage unit
    const tx4 = new Transaction();
    const [cap4, rec4] = tx4.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
      typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
      arguments: [tx4.object(characterId), tx4.object(ownerCapId)],
    });
    tx4.moveCall({
      target: `${WORLD_PACKAGE_ID}::storage_unit::online`,
      arguments: [tx4.object(storageUnitId), tx4.object(nwnId), tx4.object(ENERGY_CONFIG), cap4],
    });
    tx4.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
      typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
      arguments: [tx4.object(characterId), cap4, rec4],
    });
    await client.signAndExecuteTransaction({ transaction: tx4, signer: adminKeypair });

    // Deposit items (type 1 and type 2)
    for (const [itemUniqueId, typeId] of [[BigInt(addrNum) + 100n, 1n], [BigInt(addrNum) + 200n, 2n]]) {
      const txD = new Transaction();
      const [capD, recD] = txD.moveCall({
        target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
        typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
        arguments: [txD.object(characterId), txD.object(ownerCapId)],
      });
      txD.moveCall({
        target: `${WORLD_PACKAGE_ID}::storage_unit::game_item_to_chain_inventory`,
        typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
        arguments: [
          txD.object(storageUnitId), txD.object(ADMIN_ACL), txD.object(characterId), capD,
          txD.pure.u64(itemUniqueId), txD.pure.u64(typeId), txD.pure.u64(10n), txD.pure.u32(100),
        ],
      });
      txD.moveCall({
        target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
        typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
        arguments: [txD.object(characterId), capD, recD],
      });
      await client.signAndExecuteTransaction({ transaction: txD, signer: adminKeypair });
    }

    // Authorize DeadDropAuth extension
    const tx5 = new Transaction();
    const [cap5, rec5] = tx5.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
      typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
      arguments: [tx5.object(characterId), tx5.object(ownerCapId)],
    });
    tx5.moveCall({
      target: `${WORLD_PACKAGE_ID}::storage_unit::authorize_extension`,
      typeArguments: [`${WORLD_PACKAGE_ID}::config::DeadDropAuth`],
      arguments: [tx5.object(storageUnitId), cap5],
    });
    tx5.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
      typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
      arguments: [tx5.object(characterId), cap5, rec5],
    });
    await client.signAndExecuteTransaction({ transaction: tx5, signer: adminKeypair });

    // Restore character address to user
    const tx6 = new Transaction();
    tx6.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::update_address`,
      arguments: [tx6.object(characterId), tx6.object(ADMIN_ACL), tx6.pure.address(walletAddress)],
    });
    await client.signAndExecuteTransaction({ transaction: tx6, signer: adminKeypair });

    // Send some SUI for gas
    const tx7 = new Transaction();
    const [coin] = tx7.splitCoins(tx7.gas, [300000000]); // 0.3 SUI
    tx7.transferObjects([coin], walletAddress);
    await client.signAndExecuteTransaction({ transaction: tx7, signer: adminKeypair });

    return res.status(200).json({
      status: "success",
      characterId,
      storageUnitId,
      ownerCapId,
      message: "Account provisioned! You can now buy and sell intel.",
    });
  } catch (error: any) {
    console.error("Onboarding error:", error);
    return res.status(500).json({
      error: error?.message || "Onboarding failed",
    });
  }
}
