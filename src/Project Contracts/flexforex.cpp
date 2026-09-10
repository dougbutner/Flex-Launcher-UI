#include "flexforex.hpp"
#include "include/alcorswap_interface.hpp"
#include "include/rng_interface.hpp"
#include <cstdint>
#include <vector>
#include <eosio/crypto.hpp>
#include <eosio/system.hpp>
#include <eosio/transaction.hpp>

//contractName:flexforex

namespace eosio {

// === Balance helpers (eosio.token) === //

void flexforex::sub_balance(const name& owner, const asset& value) {
    accounts from_acnts(get_self(), owner.value);
    const auto& from = from_acnts.get(value.symbol.code().raw(), "no balance object found");
    check(from.balance.amount >= value.amount, "⟁ Overdrawn balance. Ensure you can pay the amount + fee. ");
    from_acnts.modify(from, owner, [&](auto& a) { a.balance -= value; });
}//END sub_balance()

void flexforex::add_balance(const name& owner, const asset& value, const name& ram_payer) {
    accounts to_acnts(get_self(), owner.value);
    auto to = to_acnts.find(value.symbol.code().raw());
    if(to == to_acnts.end())
        to_acnts.emplace(ram_payer, [&](auto& a) { a.balance = value; });
    else
        to_acnts.modify(to, same_payer, [&](auto& a) { a.balance += value; });
}//END add_balance()

// Keep flexers.balance in sync with accounts; create row + bump flexer_count on first sight.
void flexforex::update_flex_balance(const name& owner, const asset& value, const name& ram_payer) {
    flexers flex_acnts(get_self(), value.symbol.code().raw());
    stats statstable(get_self(), value.symbol.code().raw());
    accounts user_accounts(get_self(), owner.value);
    auto account_it = user_accounts.find(value.symbol.code().raw());
    asset actual = account_it != user_accounts.end() ? account_it->balance : asset{0, value.symbol};

    auto flex_it = flex_acnts.find(owner.value);
    if(flex_it == flex_acnts.end()) {
        if(actual.amount == 0 || owner == get_self()) return;
        ensure_flexer(flex_acnts, statstable, owner, value.symbol, ram_payer);
        flex_acnts.modify(flex_acnts.find(owner.value), same_payer, [&](auto& a) { a.balance = actual; });
    } else if(actual.amount == 0) {
        flex_acnts.erase(flex_it);
        auto st = statstable.find(value.symbol.code().raw());
        if(st != statstable.end() && st->flexer_count > 0)
            statstable.modify(st, same_payer, [&](auto& s) { s.flexer_count -= 1; });
    } else {
        flex_acnts.modify(flex_it, same_payer, [&](auto& a) {
            a.balance = actual;
            if(!a.beneficiary.value) a.beneficiary = a.owner;
        });
    }
}//END update_flex_balance()

flexforex::flexers::const_iterator flexforex::ensure_flexer(flexers& table, stats& statstable,
                                                           const name& owner, const symbol& sym,
                                                           const name& ram_payer) {
    auto itr = table.find(owner.value);
    if(itr != table.end()) return itr;
    itr = table.emplace(ram_payer, [&](auto& f) {
        f.owner = owner;
        f.balance = asset{0, sym};
        f.beneficiary = owner;
        f.bene_rate = 10000;
        f.angel_number = 1000;
    });
    auto st = statstable.find(sym.code().raw());
    if(st != statstable.end())
        statstable.modify(st, same_payer, [&](auto& s) { s.flexer_count += 1; });
    return itr;
}//END ensure_flexer()

void flexforex::open_holder_ram(const name& owner, const symbol& sym, const name& ram_payer) {
    accounts acnts(get_self(), owner.value);
    if(acnts.find(sym.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, sym}; });
    flexers table(get_self(), sym.code().raw());
    stats statstable(get_self(), sym.code().raw());
    ensure_flexer(table, statstable, owner, sym, ram_payer);
}//END open_holder_ram()

void flexforex::drop_flexer_if_empty(const name& owner, const symbol& sym) {
    accounts acnts(get_self(), owner.value);
    auto ait = acnts.find(sym.code().raw());
    if(ait != acnts.end() && ait->balance.amount != 0) return;
    flexers table(get_self(), sym.code().raw());
    auto fit = table.find(owner.value);
    if(fit == table.end()) return;
    table.erase(fit);
    stats statstable(get_self(), sym.code().raw());
    auto st = statstable.find(sym.code().raw());
    if(st != statstable.end() && st->flexer_count > 0)
        statstable.modify(st, same_payer, [&](auto& s) { s.flexer_count -= 1; });
}//END drop_flexer_if_empty()

// Contract, issuer, admin, or optional_user may authorize.
void flexforex::require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user) {
    bool ok = has_auth(get_self()) || has_auth(st.issuer) ||
              (conf.admin_account.value && has_auth(conf.admin_account)) ||
              (optional_user.value && has_auth(optional_user));
    check(ok, "⟁ Missing required signing authority");
}//END require_token_auth()

void flexforex::maybe_apply_unlock_fee(launches_table& launches, launches_table::const_iterator launch_it, bool force_alcor) {
    const uint16_t extra_cap = (launch_it->flex_quote ? 0 : PROTO_BPS_HALF) + PROTO_BPS_HALF;
    if(launch_it->dev_bps >= extra_cap && launch_it->club_bps >= extra_cap) return;

    const uint32_t now = current_time_point().sec_since_epoch();
    if(!force_alcor && (!launch_it->unlock_time || now < launch_it->unlock_time)) return;

    bool still_locked = false;
    if(launch_it->pure_liquid_alcor_pool_id && launch_it->position_id) {
        alcor::positions_t positions(SWAP_ALCOR, launch_it->pure_liquid_alcor_pool_id);
        auto pit = positions.find(launch_it->position_id);
        if(pit != positions.end() && pit->liquidity > 0) {
            uint32_t unlock = alcor::get_unlock_time(SWAP_ALCOR, launch_it->position_id);
            still_locked = unlock > now;
        }
    }
    if(still_locked) return;

    launches.modify(launch_it, same_payer, [&](auto& row) {
        row.dev_bps = extra_cap;
        row.club_bps = extra_cap;
    });
}//END maybe_apply_unlock_fee()

static uint64_t rng_word(const checksum256& h, uint32_t i) {
    const auto b = h.extract_as_byte_array();
    uint32_t o = (i % 4) * 8;
    uint64_t v = 0;
    for(uint32_t k = 0; k < 8; ++k) v = (v << 8) | b[o + k];
    return v ^ ((uint64_t)i * 0x9E3779B97F4A7C15ULL);
}

void flexforex::request_rng(uint64_t assoc_id, uint8_t kind, int64_t amt) {
    settings_table config(get_self(), assoc_id);
    auto it = config.find(assoc_id);
    check(it != config.end() && it->rng_kind == 0, "⟁ RNG already pending");
    config.modify(it, same_payer, [&](auto& c) { c.rng_kind = kind; c.rng_amt = amt; });
    uint64_t sv = (uint64_t)current_time_point().time_since_epoch().count()
                ^ (assoc_id << 1) ^ ((uint64_t)kind << 48)
                ^ (uint64_t)(uint32_t)tapos_block_prefix();
    rngoracle::requestrand(assoc_id, sv, get_self());
}//END request_rng()

// === Core token lifecycle === //

// === Create === //
// --- Create a new reflection token and default settings --- //
ACTION flexforex::create(const name& issuer, const asset& maximum_supply) {
    // - Auth + issuer exists
    require_auth(issuer);
    check(is_account(issuer), "⟁ Issuer account does not exist");
    auto sym = maximum_supply.symbol;
    check(sym.is_valid() && maximum_supply.is_valid() && maximum_supply.amount > 0, "⟁ Invalid symbol/supply");

    stats statstable(get_self(), sym.code().raw());
    check(statstable.find(sym.code().raw()) == statstable.end(), "⟁ A token with symbol already exists.");

    // Zero fee pools. Channel pots are credited on transfer from reflection_rate.
    statstable.emplace(issuer, [&](auto& s) {
        s.supply.symbol = sym;
        s.max_supply = maximum_supply;
        s.issuer = issuer;
        s.reflection_pool = s.burn_pool = s.project_pool =
        s.angel_numbers_pool = s.jackpot_pool = asset{0, sym};
    });

    // Default: 100% of reflection_pool is standard until ratios / setdist set channel bps.
    settings_table config(get_self(), sym.code().raw());
    if(config.find(sym.code().raw()) == config.end()) {
        config.emplace(issuer, [&](auto& c) {
            c.token_symbol = sym;
            c.limit = 100;
            c.reflection_rate = 0;
            c.burn_rate = 0;
            c.project_rate = 0;
            c.project_account = issuer;
            c.admin_account = issuer;
        });
    }
}//END create()

// === Mint === //
ACTION flexforex::mint(const name& to, const asset& quantity, const string& memo) {
    check(quantity.symbol.is_valid() && memo.size() <= 256, "⟁ Invalid mint data");
    stats statstable(get_self(), quantity.symbol.code().raw());
    const auto& st = statstable.get(quantity.symbol.code().raw(), "⟁ Create token before issue");
    require_auth(st.issuer);
    check(to == st.issuer, "⟁ tokens can only be issued to issuer account");
    check(quantity.is_valid() && quantity.amount > 0, "⟁ must issue positive quantity");
    check(quantity.symbol == st.supply.symbol, "⟁ Symbol precision mismatch");
    check(quantity.amount <= st.max_supply.amount - st.supply.amount, "⟁ Exceeds max supply");

    statstable.modify(st, same_payer, [&](auto& s) { s.supply += quantity; });
    add_balance(st.issuer, quantity, st.issuer);
    update_flex_balance(st.issuer, quantity, st.issuer);
}//END mint()

// === Burn === //
ACTION flexforex::burn(const name& username, const asset& quantity, const string& memo) {
    check(quantity.symbol.is_valid() && memo.size() <= 256, "⟁ Invalid burn data");
    stats statstable(get_self(), quantity.symbol.code().raw());
    const auto& st = statstable.get(quantity.symbol.code().raw(), "⟁ token with symbol does not exist");
    require_auth(username);
    check(quantity.is_valid() && quantity.amount > 0 && quantity.symbol == st.supply.symbol, "⟁ bad burn amount");

    statstable.modify(st, same_payer, [&](auto& s) { s.supply -= quantity; });
    sub_balance(username, quantity);
    update_flex_balance(username, -quantity, username);

    accounts acnts(get_self(), username.value);
    auto it = acnts.find(quantity.symbol.code().raw());
    if(it != acnts.end() && it->balance.amount == 0) acnts.erase(it);
    drop_flexer_if_empty(username, quantity.symbol);
}//END burn()

// === Open / close balance rows === //
ACTION flexforex::open(const name& owner, const symbol& symbol, const name& ram_payer) {
    require_auth(ram_payer);
    check(is_account(owner), "owner account does not exist");
    stats statstable(get_self(), symbol.code().raw());
    check(statstable.get(symbol.code().raw(), "symbol does not exist").supply.symbol == symbol, "⟁ Symbol precision mismatch");
    accounts acnts(get_self(), owner.value);
    if(acnts.find(symbol.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, symbol}; });
}//END open()

ACTION flexforex::close(const name& owner, const symbol& symbol) {
    require_auth(owner);
    accounts acnts(get_self(), owner.value);
    auto it = acnts.find(symbol.code().raw());
    check(it != acnts.end() && it->balance.amount == 0, "Cannot close (missing or non-zero balance)");
    acnts.erase(it);
    drop_flexer_if_empty(owner, symbol);
}//END close()

/**
 * Transfer + tax.
 * Fees (reflection/burn/project) apply unless sender is contract (distribution) or banned.
 * reflection_rate is split on receipt into angel_numbers_pool, jackpot_pool, and reflection_pool.
 */
// === Transfer === //
ACTION flexforex::transfer(const name& from, const name& to, const asset& quantity, const string& memo) {
    // - Sender must authorize; vault pays only as get_self()
    require_auth(from);
    check(from != to && is_account(to), "⟁ bad transfer parties");
    check(memo.size() <= 256, "✍️ memo too long ");

    auto sym = quantity.symbol.code();
    stats statstable(get_self(), sym.raw());
    const auto& st = statstable.get(sym.raw(), "⟁ no balance with specified symbol");

    accounts from_acnts(get_self(), from.value);
    const auto& from_row = from_acnts.get(sym.raw(), "⟁ sender has no balance of this token");
    check(from_row.balance.amount >= quantity.amount, "⟁ sender lacks balance for transfer + flex fee. Send less.");
    check(quantity.is_valid() && quantity.amount > 0 && quantity.symbol == st.supply.symbol, "⟁ Bad quantity");

    require_recipient(from);
    require_recipient(to);

    const bool is_dist = (from == get_self()); // contract paying reflections — no re-tax
    const bool from_alcor = (from == "alcor"_n || from == "swap.alcor"_n || from == "gold.mon3y"_n);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(sym.raw());
    const bool launched = launch_it != launches.end() && launch_it->launched;
    const bool to_alcor = (to == SWAP_ALCOR);
    if(!launched && !to_alcor && !is_dist && !from_alcor) {
        check(false, "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");
    }

    flexers flex_table(get_self(), sym.raw());
    auto flex_it = flex_table.find(from.value);
    const bool banned = flex_it != flex_table.end() && flex_it->fee_opted_out;
    const bool seed_exempt = !launched && to_alcor;
    // - No tax: swap.alcor Dec/Col (subliquid/collect), alcor order c (cancel)
    const bool alcor_skip_fee =
        (from == SWAP_ALCOR && memo.size() >= 3 && (memo.compare(0, 3, "Dec") == 0 || memo.compare(0, 3, "Col") == 0)) ||
        (from == "alcor"_n && memo.size() >= 7 && memo.compare(0, 7, "order c") == 0);

    asset total_deduction = quantity;
    asset actual_transfer = quantity;
    auto payer = has_auth(to) ? to : from;

    if(!is_dist && !banned && !seed_exempt && !alcor_skip_fee) {
        settings_table config(get_self(), sym.raw());
        const auto& conf = config.get(sym.raw(), "Distribution config not set 🤷");

        asset reflection_fee{(quantity.amount * conf.reflection_rate) / 10000, quantity.symbol};
        asset burn_fee{(quantity.amount * conf.burn_rate) / 10000, quantity.symbol};
        asset project_fee{(quantity.amount * conf.project_rate) / 10000, quantity.symbol};

        // Alcor path: fees come out of the transfer amount; else fees add on top.
        total_deduction = from_alcor ? quantity : quantity + reflection_fee + burn_fee + project_fee;
        if(from_row.balance.amount < total_deduction.amount) {
            // Max-balance send: shrink received amount so fees still fit.
            total_deduction = from_row.balance;
            int64_t rem = total_deduction.amount - reflection_fee.amount - burn_fee.amount - project_fee.amount;
            actual_transfer = asset{rem > 0 ? rem : 0, quantity.symbol};
        } else if(from_alcor) {
            actual_transfer = asset{quantity.amount - reflection_fee.amount - burn_fee.amount - project_fee.amount, quantity.symbol};
        }

        add_balance(get_self(), reflection_fee, get_self());
        if(burn_fee.amount > 0) add_balance(get_self(), burn_fee, get_self());
        if(project_fee.amount > 0) add_balance(get_self(), project_fee, get_self());

        statstable.modify(st, same_payer, [&](auto& s) {
            int64_t n = (reflection_fee.amount * conf.angel_numbers_bps) / 10000;
            int64_t j = (reflection_fee.amount * conf.jackpot_bps) / 10000;
            s.angel_numbers_pool += asset{n, quantity.symbol};
            s.jackpot_pool += asset{j, quantity.symbol};
            s.reflection_pool += asset{reflection_fee.amount - n - j, quantity.symbol};
            if(!from_alcor) s.burn_pool += burn_fee;
            s.project_pool += project_fee;
        });
    }

    sub_balance(from, total_deduction);
    add_balance(to, actual_transfer, payer);
    update_flex_balance(from, -total_deduction, from);
    update_flex_balance(to, actual_transfer, payer);
}//END transfer()

// === Config === //
// --- Contract only: pagination / admin. Tax is setfees. Issuer cannot call this. --- //
ACTION flexforex::setconfig(const symbol& sym, const std::optional<uint64_t>& start_key, const std::optional<uint32_t>& limit,
                            const std::optional<uint16_t>& reflection_rate, const std::optional<uint16_t>& burn_rate,
                            const std::optional<uint16_t>& project_rate, const std::optional<name>& project_account,
                            const std::optional<name>& admin_account) {
    require_auth(get_self());
    stats statstable(get_self(), sym.code().raw());
    const auto& st = statstable.get(sym.code().raw(), "⟁ token with symbol does not exist");
    check(sym.is_valid() && st.supply.symbol == sym, "⟁ Bad symbol");

    settings_table config(get_self(), sym.code().raw());
    auto itr = config.find(sym.code().raw());
    const uint32_t lim = limit.value_or(itr != config.end() ? itr->limit : 100);
    check(lim > 0 && lim <= 1000, "⟁ Limit must be 1-1000");
    if(admin_account && admin_account->value)
        check(is_account(*admin_account), "⟁ Admin account does not exist");

    auto write = [&](auto& c) {
        c.token_symbol = sym;
        if(start_key) c.start_key = *start_key;
        c.limit = lim;
        if(admin_account && admin_account->value) c.admin_account = *admin_account;
        else if(itr == config.end()) c.admin_account = get_self();
    };
    if(itr == config.end()) config.emplace(get_self(), write);
    else config.modify(itr, same_payer, write);
}//END setconfig()

// === Set fees === //
// --- Issuer or contract. First call (sum 0) sets tax. Later: total cannot rise, reflection cannot fall. --- //
ACTION flexforex::setfees(const symbol& sym, uint16_t reflection_rate, uint16_t burn_rate, uint16_t project_rate,
                          const name& project_account) {
    stats statstable(get_self(), sym.code().raw());
    const auto& st = statstable.get(sym.code().raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");
    check(sym.is_valid() && st.supply.symbol == sym, "⟁ Bad symbol");

    settings_table config(get_self(), sym.code().raw());
    auto itr = config.find(sym.code().raw());
    check(itr != config.end(), "⟁ Distribution config not set");
    const uint32_t old_sum = (uint32_t)itr->reflection_rate + itr->burn_rate + itr->project_rate;
    const uint32_t new_sum = (uint32_t)reflection_rate + burn_rate + project_rate;
    check(new_sum <= 10000, "⟁ Total fees cannot exceed 100%");
    if(old_sum > 0) {
        check(new_sum <= old_sum, "⟁ Total tax cannot increase");
        check(reflection_rate >= itr->reflection_rate, "⟁ Reflection cannot go down");
    }
    name proj = project_account.value ? project_account : st.issuer;
    check(is_account(proj), "⟁ Project account does not exist");

    config.modify(itr, same_payer, [&](auto& c) {
        c.reflection_rate = reflection_rate;
        c.burn_rate = burn_rate;
        c.project_rate = project_rate;
        c.project_account = proj;
    });
}//END setfees()

// === Set ratios === //
// --- Issuer (own token) or contract: angel numbers / jackpot bps; remainder is standard --- //
ACTION flexforex::ratios(const string& token_symbol, uint16_t angel_numbers_bps, uint16_t jackpot_bps) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");
    check((uint32_t)angel_numbers_bps + jackpot_bps <= 10000, "⟁ angel numbers + jackpot amount exceeds 100%");

    settings_table config(get_self(), code.raw());
    auto conf_it = config.find(code.raw());
    check(conf_it != config.end(), "Distribution config not set");
    check(conf_it->token_symbol.code().raw() == code.raw(), "⟁ settings row is not this token");

    config.modify(conf_it, same_payer, [&](auto& c) {
        c.angel_numbers_bps = angel_numbers_bps;
        c.jackpot_bps = jackpot_bps;
    });
}//END ratios()

/**
 * One-shot for issuer/admin: luck winners, cooldown, keeper/reflect mins, initial channel bps.
 * Contract may call again after dist_locked. Tax rates are not in this action.
 */
ACTION flexforex::setdist(const string& token_symbol, uint16_t angel_numbers_bps, uint16_t jackpot_bps,
                          uint16_t jackpot_winners, int64_t jackpot_min_hold, uint32_t angel_numbers_cooldown,
                          int64_t keeper_min, int64_t reflect_min) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    auto conf_it = config.find(code.raw());
    check(conf_it != config.end(), "Distribution config not set");
    const bool contract_auth = has_auth(get_self());
    if(!contract_auth) {
        require_token_auth(st, *conf_it);
        check(!conf_it->dist_locked, "⟁ Distribute already locked");
    }
    check((uint32_t)angel_numbers_bps + jackpot_bps <= 10000, "⟁ angel numbers + jackpot amount exceeds 100%");
    if(jackpot_bps) check(jackpot_winners > 0, "⟁ jackpot needs winners > 0");
    if(angel_numbers_bps) check(angel_numbers_cooldown > 0, "⟁ angel numbers needs cooldown");

    config.modify(conf_it, same_payer, [&](auto& c) {
        c.dist_locked = true;
        c.angel_numbers_bps = angel_numbers_bps;
        c.jackpot_bps = jackpot_bps;
        c.jackpot_winners = jackpot_winners;
        c.jackpot_min_hold = jackpot_min_hold;
        c.angel_numbers_cooldown = angel_numbers_cooldown;
        c.keeper_min = keeper_min;
        c.reflect_min = reflect_min;
    });
}//END setdist()

// === Holder opts: numbers code, feeoptout === //

ACTION flexforex::setangelnum(const name& owner, const string& token_symbol, uint16_t angel_number) {
    require_auth(owner);
    check(angel_number <= 999 && !token_symbol.empty(), "⟁ code 0-999 required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    check(config.get(code.raw(), "Distribution config not set").angel_numbers_bps > 0, "⟁ angel numbers not enabled");

    flexers flex_table(get_self(), code.raw());
    auto fit = ensure_flexer(flex_table, statstable, owner, st.supply.symbol, owner);
    flex_table.modify(fit, same_payer, [&](auto& f) { f.angel_number = angel_number; });
}//END setangelnum()

ACTION flexforex::feeoptout(const name& account, const bool& ban_status, const string& token_symbol) {
    check(is_account(account) && !token_symbol.empty(), "⟁ bad feeoptout data");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    const auto& conf = config.get(code.raw(), "Distribution config not set");

    // Self can only ban (opt out of reflections); admins can toggle either way.
    if(has_auth(account)) check(ban_status, "⟁ you can remove fees, not add them back. 🤷 flex.report");
    else require_token_auth(st, conf);

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, statstable, account, st.supply.symbol, get_self());
    flex_table.modify(itr, same_payer, [&](auto& f) { f.fee_opted_out = ban_status; });
}//END feeoptout()

// === Numbers: draw 0-999, pay matching holders from angel_numbers_pool === //
ACTION flexforex::pullangel(const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    auto st = statstable.find(code.raw());
    check(st != statstable.end(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    const auto& conf = config.get(code.raw(), "Distribution config not set");
    check(conf.angel_numbers_bps && conf.angel_numbers_cooldown, "⟁ angel numbers not enabled");

    uint32_t now = current_time_point().sec_since_epoch();
    check(now >= st->angel_numbers_last + conf.angel_numbers_cooldown, "⟁ angel numbers cooldown");

    const symbol& sym = conf.token_symbol;
    check(st->angel_numbers_pool.symbol == sym, "⟁ Symbol precision mismatch");
    int64_t pot = st->angel_numbers_pool.amount;
    check(pot > 0, "⟁ Angel numbers pot empty");
    check(conf.rng_kind == 0, "⟁ RNG already pending");

    statstable.modify(st, same_payer, [&](auto& s) {
        s.angel_numbers_pool.amount = 0;
        s.angel_numbers_last = now;
    });
    request_rng(code.raw(), RNG_NUMBERS, pot);
}//END pullangel()

ACTION flexforex::pulljackpot(const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    auto st = statstable.find(code.raw());
    check(st != statstable.end(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    const auto& conf = config.get(code.raw(), "Distribution config not set");
    check(conf.jackpot_bps && conf.jackpot_winners, "⟁ jackpot not enabled");
    check(conf.rng_kind == 0, "⟁ RNG already pending");

    const symbol& sym = conf.token_symbol;
    check(st->jackpot_pool.symbol == sym, "⟁ Symbol precision mismatch");
    int64_t pot = st->jackpot_pool.amount;
    check(pot > 0, "⟁ Jackpot pot empty");

    statstable.modify(st, same_payer, [&](auto& s) { s.jackpot_pool.amount = 0; });
    request_rng(code.raw(), RNG_JACKPOT, pot);
}//END pulljackpot()

// === RNG callback (XPR rng::setrand → receiverand) === //
ACTION flexforex::receiverand(uint64_t assoc_id, const checksum256& random_value) {
    require_auth(RNG);
    settings_table config(get_self(), assoc_id);
    auto conf_it = config.find(assoc_id);
    check(conf_it != config.end() && conf_it->rng_kind, "⟁ No pending rng");
    uint8_t kind = conf_it->rng_kind;
    int64_t pot = conf_it->rng_amt;
    const symbol& sym = conf_it->token_symbol;
    config.modify(conf_it, same_payer, [&](auto& c) { c.rng_kind = 0; c.rng_amt = 0; });

    stats statstable(get_self(), sym.code().raw());
    auto st = statstable.find(sym.code().raw());
    check(st != statstable.end(), "⟁ token with symbol does not exist");
    flexers flex_table(get_self(), sym.code().raw());

    auto refund = [&](int64_t amt) {
        if(amt > 0)
            statstable.modify(st, same_payer, [&](auto& s) {
                if(kind == RNG_NUMBERS) s.angel_numbers_pool += asset{amt, sym};
                else s.jackpot_pool += asset{amt, sym};
            });
    };

    if(kind == RNG_NUMBERS) {
        uint16_t draw = (uint16_t)(rng_word(random_value, 0) % 1000);
        auto bynum = flex_table.get_index<"byangel"_n>();
        std::vector<name> winners;
        int64_t bsum = 0;
        for(auto itr = bynum.lower_bound(draw); itr != bynum.end() && itr->angel_number == draw; ++itr) {
            if(itr->owner == get_self() || itr->fee_opted_out || itr->balance.amount <= 0) continue;
            winners.push_back(itr->owner);
            bsum += itr->balance.amount;
        }
        if(winners.empty() || bsum <= 0) { refund(pot); return; }
        int64_t remaining = pot;
        for(size_t i = 0; i < winners.size(); ++i) {
            auto fit = flex_table.find(winners[i].value);
            if(fit == flex_table.end()) continue;
            int64_t share = (int64_t)((__int128)pot * fit->balance.amount / bsum);
            if(i + 1 == winners.size()) share = remaining;
            if(share > remaining) share = remaining;
            if(share <= 0) continue;
            remaining -= share;
            action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
                   std::make_tuple(get_self(), winners[i], asset{share, sym}, string("Angel Number Calling 👼"))).send();
        }
        refund(remaining);
        return;
    }

    // Jackpot: PK samples from rng words (same scoped table, O(winners) lookups).
    int64_t one = 1;
    for(uint8_t i = 0; i < sym.precision(); ++i) one *= 10;
    uint16_t nwin = conf_it->jackpot_winners > 32 ? 32 : conf_it->jackpot_winners;
    name winners[32];
    uint16_t got = 0;
    for(uint16_t i = 0; i < nwin * 2 && got < nwin; ++i) {
        auto cand = flex_table.lower_bound(rng_word(random_value, i));
        if(cand == flex_table.end()) cand = flex_table.begin();
        if(cand == flex_table.end()) break;
        if(cand->owner == get_self() || cand->fee_opted_out) continue;
        if(cand->balance.symbol != sym || cand->balance.amount < conf_it->jackpot_min_hold || cand->balance.amount < one) continue;
        bool dup = false;
        for(uint16_t j = 0; j < got; ++j) if(winners[j] == cand->owner) { dup = true; break; }
        if(!dup) winners[got++] = cand->owner;
    }
    if(!got) { refund(pot); return; }
    int64_t wsum = 0;
    for(uint16_t i = 0; i < got; ++i) {
        auto fit = flex_table.find(winners[i].value);
        wsum += (fit != flex_table.end() && fit->balance.amount > 0) ? fit->balance.amount : 0;
    }
    if(wsum <= 0) { refund(pot); return; }
    int64_t remaining = pot;
    for(uint16_t i = 0; i < got && remaining > 0; ++i) {
        auto fit = flex_table.find(winners[i].value);
        if(fit == flex_table.end()) continue;
        int64_t share = (int64_t)((__int128)pot * fit->balance.amount / wsum);
        if(i + 1 == got) share = remaining;
        if(share > remaining) share = remaining;
        if(share <= 0) continue;
        remaining -= share;
        action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
               std::make_tuple(get_self(), winners[i], asset{share, sym}, string("Jackpot 💰"))).send();
    }
    refund(remaining);
}//END receiverand()

// === makeitrain: splash reflection_pool only === //
ACTION flexforex::makeitrain(const string& token_symbol, const name& keeper) {
    require_auth(keeper);
    check(is_account(keeper), "⟁ keeper account does not exist");
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    auto st = statstable.find(code.raw());
    check(st != statstable.end(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    auto conf_it = config.find(code.raw());
    check(conf_it != config.end(), "⟁ Distribution config not set");
    const auto& conf = *conf_it;
    const symbol& sym = conf.token_symbol;
    check(st->reflection_pool.symbol == sym, "⟁ Symbol precision mismatch");

    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end() && launch_it->launched,
          "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");
    maybe_apply_unlock_fee(launches, launch_it, false);

    int64_t one = 1;
    for(uint8_t i = 0; i < sym.precision(); ++i) one *= 10;
    int64_t min_pool = conf.reflect_min > 0 ? conf.reflect_min : one;

    int64_t standard = st->reflection_pool.amount;
    asset nyra{(standard * launch_it->dev_bps) / 10000, sym};
    asset reflc{(standard * launch_it->club_bps) / 10000, sym};
    asset partner = nyra + reflc;
    if(partner.amount > 0 && partner.amount <= standard) standard -= partner.amount;
    else { nyra.amount = 0; reflc.amount = 0; partner.amount = 0; }

    int64_t std_pay = (standard * PAY_NUM) / PAY_DEN;
    bool do_std = std_pay >= min_pool;
    check(do_std || partner.amount,
          "⟁ " + asset{std_pay, sym}.to_string() + " / " + asset{min_pool, sym}.to_string()
              + " needed to make it rain");

    flexers flex_table(get_self(), code.raw());
    flexpools pools(get_self(), code.raw());

    asset total_supply = get_supply(get_self(), code);
    asset alcor{0, sym};
    for(name a : {"alcor"_n, "gold.mon3y"_n, "swap.alcor"_n}) {
        accounts ac(get_self(), a.value);
        auto it = ac.find(code.raw());
        if(it != ac.end()) alcor += it->balance;
    }
    total_supply -= alcor;
    check(total_supply.amount > 0, "⟁ adjusted total supply must be positive");
    int64_t denom = total_supply.amount;

    asset std_paid{0, sym};

    auto send_share = [&](const flexer& row, asset share, asset& counter) {
        if(share.amount <= 0) return;
        check(share.symbol == sym, "⟁ Symbol precision mismatch");
        name bene = row.beneficiary.value ? row.beneficiary : row.owner;
        if(!is_account(bene)) bene = row.owner;
        uint16_t br = row.bene_rate > 10000 ? 10000 : row.bene_rate;
        if(br == 0 && !row.beneficiary.value) br = 10000;
        asset tree{(share.amount * br) / 10000, sym};
        asset hold = share - tree;

        auto pay = [&](name recipient, asset amount, bool use_custom) {
            if(amount.amount <= 0) return;
            string memo = "Reflection · flex.forex  · ";
            name to = recipient;
            if(use_custom && !row.custom_memo.empty()) {
                memo = row.custom_memo;
                auto put = [&](const string& tok, const string& val) {
                    for(size_t p = 0; (p = memo.find(tok, p)) != string::npos; p += val.size())
                        memo.replace(p, tok.size(), val);
                };
                put("@@", recipient.to_string());
                put("$$", amount.to_string());
                put("**", amount.symbol.code().to_string());
            } else {
                uint64_t pid = row.flex_reward_pool_id;
                if(!pid && launch_it->swap_underlying_default) pid = launch_it->pure_liquid_alcor_pool_id;
                auto pit = pools.find(pid);
                const symbol* out = nullptr;
                name ocon;
                uint64_t oid = pid;
                if(pit != pools.end()) {
                    out = &pit->output_symbol;
                    ocon = pit->output_contract;
                    oid = pit->id;
                } else if(pid && pid == launch_it->pure_liquid_alcor_pool_id) {
                    out = &launch_it->quote.quantity.symbol;
                    ocon = launch_it->quote.contract;
                }
                if(out && !(ocon == get_self() && *out == sym)) {
                    uint8_t prec = out->precision();
                    string min_amount = prec == 0 ? string("1") : ("0" + std::string(prec - 1, '0') + "1");
                    if(prec) min_amount.insert(1, ".");
                    memo = "swapexactin#" + std::to_string(oid) + "#" + recipient.to_string() + "#" +
                           min_amount + " " + out->code().to_string() + "@" +
                           ocon.to_string() + "#0#reflections";
                    to = "swap.alcor"_n;
                }
            }
            check(memo.size() <= 256, "✍️ memo has more than 256 bytes");
            open_holder_ram(to, sym, keeper);
            action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
                   std::make_tuple(get_self(), to, amount, memo)).send();
            counter += amount;
        };
        pay(bene, tree, true);
        pay(row.owner, hold, false);
    };

    int64_t tip_amt = 0;
    if(do_std && conf.keeper_min > 0) {
        int64_t cap = (standard * PAY_NUM) / PAY_DEN;
        tip_amt = conf.keeper_min < cap ? conf.keeper_min : cap;
        if(tip_amt > 0) standard -= tip_amt;
        std_pay = (standard * PAY_NUM) / PAY_DEN;
    }

    if(partner.amount > 0) {
        if(nyra.amount > 0) {
            open_holder_ram("nyra"_n, sym, keeper);
            add_balance("nyra"_n, nyra, keeper);
            update_flex_balance("nyra"_n, nyra, keeper);
        }
        if(reflc.amount > 0) {
            open_holder_ram("reflections"_n, sym, keeper);
            add_balance("reflections"_n, reflc, keeper);
            update_flex_balance("reflections"_n, reflc, keeper);
        }
        sub_balance(get_self(), partner);
        update_flex_balance(get_self(), -partner, keeper);
    }

    auto itr = conf.start_key == 0 ? flex_table.begin() : flex_table.lower_bound(conf.start_key);
    uint32_t processed = 0;
    if(do_std) {
        int64_t remaining = std_pay;
        while(itr != flex_table.end() && processed < conf.limit && remaining > 0) {
            if(itr->owner != get_self() && !itr->fee_opted_out &&
               itr->balance.symbol == sym && itr->balance.amount >= one) {
                int64_t share = (int64_t)((__int128)std_pay * itr->balance.amount / denom);
                if(share > remaining) share = remaining;
                send_share(*itr, asset{share, sym}, std_paid);
                remaining -= share;
            }
            ++itr;
            ++processed;
        }
    }

    asset debit = partner + asset{tip_amt, sym} + std_paid;
    st = statstable.find(code.raw());
    asset burn_qty = st->burn_pool;
    name project_acct = conf.project_account;
    asset project_qty = st->project_pool;

    if(debit.amount > 0)
        statstable.modify(st, same_payer, [&](auto& s) {
            if(s.reflection_pool.amount >= debit.amount) s.reflection_pool -= debit;
            else s.reflection_pool.amount = 0;
        });

    if(do_std) {
        st = statstable.find(code.raw());
        burn_qty = st->burn_pool;
        project_qty = st->project_pool;
        if(burn_qty.amount || project_qty.amount)
            statstable.modify(st, same_payer, [&](auto& s) {
                s.burn_pool.amount = 0;
                s.project_pool.amount = 0;
            });
    }

    if(tip_amt > 0) {
        open_holder_ram(keeper, sym, keeper);
        action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
               std::make_tuple(get_self(), keeper, asset{tip_amt, sym}, string("Keeper tip 💲"))).send();
    }
    if(do_std && burn_qty.amount > 0)
        action(permission_level{get_self(), "active"_n}, get_self(), "burn"_n,
               std::make_tuple(get_self(), burn_qty,
                   string("Burn " + std::to_string(conf.burn_rate/100) + "% of every transaction 🔥"))).send();
    if(do_std && project_qty.amount > 0 && project_acct.value && project_acct != get_self()) {
        open_holder_ram(project_acct, sym, keeper);
        action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
               std::make_tuple(get_self(), project_acct, project_qty,
                   string("Project " + std::to_string(conf.project_rate/100.0) + "% For Team · flex.forex ·"))).send();
    }

    if(do_std)
        config.modify(conf_it, same_payer, [&](auto& c) {
            c.start_key = (itr == flex_table.end()) ? 0 : itr->owner.value;
        });
}//END makeitrain()
// === Launch: register quote/range, then liftoff after issuer locks on swap.alcor === //
ACTION flexforex::startlaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
                            int32_t tick_upper, const uint128_t& sqrt_price_x64, uint64_t xtoken_proof_pool_id,
                            bool swap_underlying_default) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    require_auth(st.issuer);

    check(quote.quantity.symbol.is_valid() && quote.quantity.amount == 0, "⟁ quote must be a zero-amount extended_asset");
    check(is_account(quote.contract), "⟁ quote contract does not exist");
    check(sqrt_price_x64 > 0, "⟁ sqrt_price_x64 required (precompute off-chain)");

    int32_t spacing = 0;
    if(fee == 500) spacing = 10;
    else if(fee == 3000) spacing = 60;
    else if(fee == 10000) spacing = 200;
    check(spacing, "⟁ fee must be 500, 3000, or 10000");
    check(tick_lower < tick_upper, "⟁ tick_lower must be < tick_upper");
    check(tick_lower >= MIN_TICK && tick_upper <= MAX_TICK, "⟁ ticks out of Alcor range");
    check(tick_lower % spacing == 0 && tick_upper % spacing == 0, "⟁ ticks must be multiples of tickSpacing");

    const auto qcode = quote.quantity.symbol.code();
    const bool flex_q = (quote.contract == "mon3y"_n && qcode == symbol_code("EASY")) ||
                        (quote.contract == "w3won"_n && qcode == symbol_code("WON")) ||
                        (quote.contract == "m3m3"_n && qcode == symbol_code("MEME")) ||
                        (quote.contract == "gold.mon3y"_n && qcode == symbol_code("GRAMS"));
    if(flex_q) check(xtoken_proof_pool_id == 0, "⟁ flex quotes do not use xtoken_proof_pool_id");
    else {
        check(quote.contract == XTOKENS ||
              (quote.contract == "eosio.token"_n && qcode == symbol_code("XPR")) ||
              (quote.contract == "xmd.token"_n && qcode == symbol_code("XMD")) ||
              (quote.contract == "loan.token"_n && qcode == symbol_code("LOAN")),
              "⟁ quote must be a flex token, xtokens, XPR, XMD, or LOAN");
        check(xtoken_proof_pool_id, "⟁ xtoken launches need xtoken_proof_pool_id vs XUSDC or XPR");
        auto pool = alcor::get_pool(SWAP_ALCOR, xtoken_proof_pool_id);
        check(pool.active, "⟁ proof pool is not active");
        const symbol qsym = quote.quantity.symbol;
        const bool a_is_q = pool.tokenA.contract == quote.contract && pool.tokenA.quantity.symbol == qsym;
        const bool b_is_q = pool.tokenB.contract == quote.contract && pool.tokenB.quantity.symbol == qsym;
        check(a_is_q || b_is_q, "⟁ proof pool does not contain that xtoken");
        const auto& other = a_is_q ? pool.tokenB : pool.tokenA;
        const symbol xusdc("XUSDC", 6);
        const symbol xpr("XPR", 4);
        const bool vs_usdc = other.contract == XTOKENS && other.quantity.symbol == xusdc;
        const bool vs_xpr = other.contract == "eosio.token"_n && other.quantity.symbol == xpr;
        check(vs_usdc || vs_xpr, "⟁ proof pool must pair the xtoken with XUSDC or XPR");

        struct token_account_row {
            asset balance;
            uint64_t primary_key() const { return balance.symbol.code().raw(); }
        };
        multi_index<"accounts"_n, token_account_row> ac(quote.contract, SWAP_ALCOR.value);
        auto it = ac.find(qsym.code().raw());
        int64_t inv = it == ac.end() ? 0 : it->balance.amount;
        check(inv > 0 && pool.liquidity > 0, "⟁ no xtoken inventory on swap.alcor");

        const uint128_t sp = pool.currSlot.sqrtPriceX64;
        check(sp > 0, "⟁ unpriced or empty Alcor pool");
        int64_t quote_raw = 0;
        if(a_is_q) {
            const uint128_t mask = (uint128_t(1) << 64) - 1;
            const uint128_t hi = sp >> 64;
            const uint128_t lo = sp & mask;
            uint128_t acc = 0;
            if(hi) {
                check(hi <= uint128_t(~uint64_t(0)) && (uint64_t)inv <= ~uint64_t(0) / (uint64_t)hi / (uint64_t)hi, "⟁ price overflow");
                acc += uint128_t((uint64_t)inv) * hi * hi;
            }
            if(hi && lo) {
                uint128_t t = uint128_t((uint64_t)inv) * hi;
                check(t <= ~uint128_t(0) / lo, "⟁ price overflow");
                acc += (t * lo) >> 63;
            }
            if(lo) {
                uint128_t t = (uint128_t(lo) * lo) >> 64;
                acc += (t * (uint64_t)inv) >> 64;
            }
            check(acc <= uint128_t(~uint64_t(0) >> 1), "⟁ price overflow");
            quote_raw = (int64_t)acc;
        } else {
            uint128_t r2 = (((uint128_t)(uint64_t)inv << 64) / sp << 64) / sp;
            check(r2 <= uint128_t(~uint64_t(0) >> 1), "⟁ price overflow");
            quote_raw = (int64_t)r2;
        }

        int64_t unit = 1;
        uint8_t prec = other.quantity.symbol.precision();
        for(uint8_t i = 0; i < prec; ++i) unit *= 10;
        if(vs_usdc) check(quote_raw >= 10 * unit, "⟁ xtoken needs ≥ 10 XUSDC of Alcor inventory");
        else check(quote_raw >= 1000 * unit, "⟁ xtoken needs ≥ 1000 XPR of Alcor inventory");
    }

    launches_table launches(get_self(), get_self().value);
    auto itr = launches.find(code.raw());
    check(itr == launches.end() || !itr->launched, "⟁ already lifted off; launch params are locked");

    auto write = [&](auto& row) {
        row.token_symbol = st.supply.symbol;
        row.quote = quote;
        row.fee = fee;
        row.tick_lower = tick_lower;
        row.tick_upper = tick_upper;
        row.sqrt_price_x64 = sqrt_price_x64;
        row.xtoken_proof_pool_id = xtoken_proof_pool_id;
        row.flex_quote = flex_q;
        row.launched = false;
        row.pure_liquid_alcor_pool_id = 0;
        row.position_id = 0;
        row.dev_bps = 0;
        row.club_bps = 0;
        row.unlock_time = 0;
        row.swap_underlying_default = swap_underlying_default;
    };
    if(itr == launches.end()) launches.emplace(st.issuer, write);
    else launches.modify(itr, same_payer, write);
}//END startlaunch()

ACTION flexforex::liftoff(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    require_auth(st.issuer);

    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end(), "⟁ startlaunch first");
    check(!launch_it->launched, "⟁ already lifted off");
    check(tick_lower == launch_it->tick_lower && tick_upper == launch_it->tick_upper, "⟁ ticks must match startlaunch");

    uint64_t prior = 0;
    for(auto it = launches.begin(); it != launches.end(); ++it) {
        if(!it->launched) continue;
        stats others(get_self(), it->token_symbol.code().raw());
        auto oit = others.find(it->token_symbol.code().raw());
        if(oit != others.end() && oit->issuer == st.issuer) ++prior;
    }
    {
        struct easy_account {
            asset    balance;
            uint64_t primary_key() const { return balance.symbol.code().raw(); }
        };
        const symbol easy("EASY", 6);
        multi_index<"accounts"_n, easy_account> easy_ac(MON3Y, st.issuer.value);
        auto eit = easy_ac.find(easy.code().raw());
        const int64_t full = LAUNCH_EASY_MIN * static_cast<int64_t>(prior + 1);
        const uint32_t nowsec = current_time_point().sec_since_epoch();
        const uint32_t promo_start = 1788912000; // 2026-09-09 00:00:00 UTC
        int32_t months = nowsec >= promo_start ? static_cast<int32_t>((nowsec - promo_start) / (30 * 86400)) : 0;
        int32_t off = 90 - 10 * months;
        if(off < 0) off = 0;
        const int64_t need = full * (100 - off) / 100;
        check(eit != easy_ac.end() && eit->balance.symbol == easy && eit->balance.amount >= need,
              "⟁ Hold " + std::to_string(need / 1000000) + " EASY on mon3y to launch");
    }

    auto pool = alcor::get_pool(SWAP_ALCOR, pool_id);
    check(pool.active, "⟁ pool is not active — pay activeFee with memo activepool#id");
    check(pool.fee == launch_it->fee, "⟁ pool fee does not match startlaunch");

    const symbol launched_sym = st.supply.symbol;
    const bool a_is_ours = pool.tokenA.contract == get_self() && pool.tokenA.quantity.symbol == launched_sym;
    const bool b_is_ours = pool.tokenB.contract == get_self() && pool.tokenB.quantity.symbol == launched_sym;
    check(a_is_ours != b_is_ours, "⟁ pool must pair this flex token with the registered quote");
    const auto& quote_side = a_is_ours ? pool.tokenB : pool.tokenA;
    check(quote_side.contract == launch_it->quote.contract &&
              quote_side.quantity.symbol == launch_it->quote.quantity.symbol,
          "⟁ pool quote does not match startlaunch");

    int32_t tick = pool.currSlot.tick;
    if(a_is_ours)
        check(tick < tick_lower, "⟁ one-sided launch: current tick must sit below the range (all tokenA)");
    else
        check(tick >= tick_upper, "⟁ one-sided launch: current tick must sit at or above the range (all tokenB)");

    auto pos = alcor::get_position(SWAP_ALCOR, pool_id, st.issuer, tick_lower, tick_upper);
    check(pos.liquidity > 0, "⟁ issuer position has no liquidity");

    uint32_t unlock = alcor::get_unlock_time(SWAP_ALCOR, pos.id);
    check(unlock >= current_time_point().sec_since_epoch() + MIN_LOCK_SECS,
          "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");

    asset supply = get_supply(get_self(), code);
    check(supply.amount > 0, "⟁ mint 100% of supply before liftoff");
    accounts alcor_ac(get_self(), SWAP_ALCOR.value);
    auto alcor_it = alcor_ac.find(code.raw());
    check(alcor_it != alcor_ac.end() && alcor_it->balance.amount == supply.amount,
          "⟁ 100% of supply must sit on swap.alcor");
    check(alcor::get_unused_balance(SWAP_ALCOR, st.issuer, get_self(), launched_sym) == 0,
          "⟁ unused Alcor balance must be 0 — put 100% into the position");

    const uint16_t bps = launch_it->flex_quote ? 0 : PROTO_BPS_HALF;
    launches.modify(launch_it, same_payer, [&](auto& row) {
        row.launched = true;
        row.pure_liquid_alcor_pool_id = pool_id;
        row.position_id = pos.id;
        row.dev_bps = bps;
        row.club_bps = bps;
        row.unlock_time = unlock;
    });
}//END liftoff()

ACTION flexforex::checklock(const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end() && launch_it->launched,
          "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");
    maybe_apply_unlock_fee(launches, launch_it, true);
}//END checklock()

// === Alcor pool routing + inheritance === //

ACTION flexforex::addpool(const uint64_t& pool_id, const string& token_symbol, const symbol& output_symbol,
                          const name& output_contract) {
    check(pool_id && !token_symbol.empty(), "⟁ bad pool args");
    check(output_symbol.is_valid() && output_contract.value, "⟁ output contract and symbol required");
    check(is_account(output_contract), "⟁ output contract account does not exist");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ Only the issuer can add a flex reward token.");

    auto pool = alcor::get_pool(SWAP_ALCOR, pool_id);
    check(pool.active, "⟁ pool is not active");
    const symbol& ours = st.supply.symbol;
    const bool a_ours = pool.tokenA.contract == get_self() && pool.tokenA.quantity.symbol == ours;
    const bool b_ours = pool.tokenB.contract == get_self() && pool.tokenB.quantity.symbol == ours;
    check(a_ours != b_ours, "⟁ pool must pair this token with one other asset");
    const auto& other = a_ours ? pool.tokenB : pool.tokenA;
    check(other.contract == output_contract && other.quantity.symbol == output_symbol,
          "⟁ Alcor pool is not that output token");

    flexpools pools(get_self(), code.raw());
    auto pair_it = pools.end();
    for(auto it = pools.begin(); it != pools.end(); ++it) {
        if(it->input_symbol == ours && it->input_contract == get_self() &&
           it->output_symbol == output_symbol && it->output_contract == output_contract) {
            pair_it = it;
            break;
        }
    }
    auto write = [&](auto& p) {
        p.id = pool_id;
        p.input_symbol = ours;
        p.input_contract = get_self();
        p.output_symbol = output_symbol;
        p.output_contract = output_contract;
    };
    if(pair_it != pools.end()) {
        if(pair_it->id == pool_id) pools.modify(pair_it, same_payer, write);
        else {
            pools.erase(pair_it);
            auto existing = pools.find(pool_id);
            if(existing == pools.end()) pools.emplace(get_self(), write);
            else pools.modify(existing, same_payer, write);
        }
    } else {
        auto itr = pools.find(pool_id);
        if(itr == pools.end()) pools.emplace(get_self(), write);
        else pools.modify(itr, same_payer, write);
    }
}//END addpool()

ACTION flexforex::choosereward(const name& owner, const string& token_symbol, const symbol& output_symbol,
                              const name& output_contract) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    const auto& conf = config.get(code.raw(), "⟁ Distribution config not set");
    require_token_auth(st, conf, owner);

    flexers flex_table(get_self(), code.raw());
    auto flex_it = flex_table.find(owner.value);

    if(!output_contract.value) {
        if(flex_it != flex_table.end())
            flex_table.modify(flex_it, same_payer, [&](auto& f) { f.flex_reward_pool_id = 0; });
        return;
    }

    check(output_symbol.is_valid(), "⟁ output contract and symbol required");
    flexpools pools(get_self(), code.raw());
    uint64_t matching_id = 0;
    for(auto pit = pools.begin(); pit != pools.end(); ++pit)
        if(pit->input_symbol == st.supply.symbol && pit->input_contract == get_self() &&
           pit->output_symbol == output_symbol && pit->output_contract == output_contract) {
            matching_id = pit->id;
            break;
        }
    check(matching_id, "⟁ No flex pool found for that output token");

    auto itr = ensure_flexer(flex_table, statstable, owner, st.supply.symbol, get_self());
    flex_table.modify(itr, same_payer, [&](auto& f) { f.flex_reward_pool_id = matching_id; });
}//END choosereward()

ACTION flexforex::inheritance(const name& flexer, const name& beneficiary, const uint16_t& rate, const string& token_symbol) {
    check(has_auth(flexer) || has_auth(get_self()), "⟁ missing authority");
    check(rate <= 10000 && !token_symbol.empty(), "⟁ bad inheritance data");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    name bene = beneficiary.value ? beneficiary : flexer;
    check(is_account(bene), "⟁ beneficiary account does not exist");

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, statstable, flexer, st.supply.symbol,
                             has_auth(get_self()) ? get_self() : flexer);
    flex_table.modify(itr, same_payer, [&](auto& f) { f.beneficiary = bene; f.bene_rate = rate; });
}//END inheritance()

ACTION flexforex::inheritmemo(const name& flexer, const string& custom_memo, const string& token_symbol) {
    check(has_auth(flexer) || has_auth(get_self()), "⟁ missing authority");
    check(custom_memo.size() <= 200 && !token_symbol.empty(), "⟁ bad inheritmemo data");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, statstable, flexer, st.supply.symbol,
                             has_auth(get_self()) ? get_self() : flexer);
    flex_table.modify(itr, same_payer, [&](auto& f) { f.custom_memo = custom_memo; });
}//END inheritmemo()

} /// namespace eosio
