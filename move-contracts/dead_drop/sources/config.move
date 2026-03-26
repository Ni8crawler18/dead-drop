/// Dead Drop shared configuration.
///
/// Publishes a shared `DeadDropConfig` and `AdminCap` at package publish time.
/// Other dead_drop modules attach their config structs as dynamic fields.
module dead_drop::config;

use sui::dynamic_field as df;

/// Shared configuration object for all Dead Drop extensions.
public struct DeadDropConfig has key {
    id: UID,
}

/// Capability granting admin access to modify Dead Drop config.
public struct AdminCap has key, store {
    id: UID,
}

/// Typed witness for storage unit extension authorization.
public struct DeadDropAuth has drop {}

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());

    let config = DeadDropConfig { id: object::new(ctx) };
    transfer::share_object(config);
}

// === Dynamic field helpers ===

public fun has_rule<K: copy + drop + store>(config: &DeadDropConfig, key: K): bool {
    df::exists_(&config.id, key)
}

public fun borrow_rule<K: copy + drop + store, V: store>(config: &DeadDropConfig, key: K): &V {
    df::borrow(&config.id, key)
}

public fun borrow_rule_mut<K: copy + drop + store, V: store>(
    config: &mut DeadDropConfig,
    _: &AdminCap,
    key: K,
): &mut V {
    df::borrow_mut(&mut config.id, key)
}

public fun set_rule<K: copy + drop + store, V: store + drop>(
    config: &mut DeadDropConfig,
    _: &AdminCap,
    key: K,
    value: V,
) {
    if (df::exists_(&config.id, copy key)) {
        let _old: V = df::remove(&mut config.id, copy key);
    };
    df::add(&mut config.id, key, value);
}

public fun remove_rule<K: copy + drop + store, V: store>(
    config: &mut DeadDropConfig,
    _: &AdminCap,
    key: K,
): V {
    df::remove(&mut config.id, key)
}

/// Mint a `DeadDropAuth` witness. Package-restricted.
public(package) fun auth(): DeadDropAuth {
    DeadDropAuth {}
}
