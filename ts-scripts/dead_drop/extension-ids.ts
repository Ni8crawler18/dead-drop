import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { requireEnv } from "../utils/helper";
import { MODULE } from "./modules";

export type DeadDropIds = {
    builderPackageId: string;
    adminCapId: string;
    configId: string;
    intelRegistryId: string;
    bountyBoardId: string;
};

export function requireBuilderPackageId(): string {
    return requireEnv("DEAD_DROP_PACKAGE_ID");
}

/**
 * Resolve Dead Drop IDs from env variables (set after publishing).
 */
export function resolveDeadDropIdsFromEnv(): {
    builderPackageId: string;
    configId: string;
    intelRegistryId: string;
    bountyBoardId: string;
} {
    return {
        builderPackageId: requireBuilderPackageId(),
        configId: requireEnv("DEAD_DROP_CONFIG_ID"),
        intelRegistryId: requireEnv("DEAD_DROP_REGISTRY_ID"),
        bountyBoardId: requireEnv("DEAD_DROP_BOUNTY_BOARD_ID"),
    };
}

/**
 * Resolve Dead Drop IDs including AdminCap lookup for the given owner.
 */
export async function resolveDeadDropIds(
    client: SuiJsonRpcClient,
    ownerAddress: string
): Promise<DeadDropIds> {
    const { builderPackageId, configId, intelRegistryId, bountyBoardId } =
        resolveDeadDropIdsFromEnv();
    const adminCapType = `${builderPackageId}::${MODULE.CONFIG}::AdminCap`;
    const result = await client.getOwnedObjects({
        owner: ownerAddress,
        filter: { StructType: adminCapType },
        limit: 1,
    });

    const adminCapId = result.data[0]?.data?.objectId;
    if (!adminCapId) {
        throw new Error(
            `AdminCap not found for ${ownerAddress}. ` +
                `Make sure this address published the dead_drop package.`
        );
    }

    return { builderPackageId, adminCapId, configId, intelRegistryId, bountyBoardId };
}
