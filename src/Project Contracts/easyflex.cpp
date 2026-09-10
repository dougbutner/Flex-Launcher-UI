#include "easyflex.hpp"
#include "include/alcorswap_interface.hpp"
#include <cstdint>
#include <eosio/system.hpp>

//contractName:easyflex

namespace eosio {

// === Balance helpers (eosio.token) === //

void easyflex::sub_balance(const name& owner, const asset& value) {
    accounts from_acnts(get_self(), owner.value);
    const auto& from = from_acnts.get(value.symbol.code().raw(), "⟁ Account has no balance");
    check(from.balance.amount >= value.amount, "⟁ Overdrawn balance. Ensure you can pay the amount + fee. ");
    from_acnts.modify(from, owner, [&](auto& a) { a.balance -= value; });
}//END sub_balance()

void easyflex::add_balance(const name& owner, const asset& value, const name& ram_payer) {
    accounts to_acnts(get_self(), owner.value);
    auto to = to_acnts.find(value.symbol.code().raw());
    if(to == to_acnts.end())
        to_acnts.emplace(ram_payer, [&](auto& a) { a.balance = value; });
    else
        to_acnts.modify(to, same_payer, [&](auto& a) { a.balance += value; });
}//END add_balance()

void easyflex::update_flex_balance(const name& owner, const asset& value, const name& ram_payer) {
    flexers flex_acnts(get_self(), value.symbol.code().raw());
    accounts user_accounts(get_self(), owner.value);
    auto account_it = user_accounts.find(value.symbol.code().raw());
    asset actual = account_it != user_accounts.end() ? account_it->balance : asset{0, value.symbol};

    auto flex_it = flex_acnts.find(owner.value);
    if(flex_it == flex_acnts.end()) {
        if(actual.amount == 0 || owner == get_self()) return;
        ensure_flexer(flex_acnts, owner, value.symbol, ram_payer);
        flex_acnts.modify(flex_acnts.find(owner.value), same_payer, [&](auto& a) { a.balance = actual; });
    } else if(actual.amount == 0) {
        flex_acnts.erase(flex_it);
    } else {
        flex_acnts.modify(flex_it, same_payer, [&](auto& a) { a.balance = actual; });
    }
}//END update_flex_balance()

easyflex::flexers::const_iterator easyflex::ensure_flexer(flexers& table, const name& owner,
                                                         const symbol& sym, const name& ram_payer) {
    auto itr = table.find(owner.value);
    if(itr != table.end()) return itr;
    return table.emplace(ram_payer, [&](auto& f) {
        f.owner = owner;
        f.balance = asset{0, sym};
    });
}//END ensure_flexer()

void easyflex::open_holder_ram(const name& owner, const symbol& sym, const name& ram_payer) {
    accounts acnts(get_self(), owner.value);
    if(acnts.find(sym.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, sym}; });
    flexers table(get_self(), sym.code().raw());
    ensure_flexer(table, owner, sym, ram_payer);
}//END open_holder_ram()

void easyflex::drop_flexer_if_empty(const name& owner, const symbol& sym) {
    accounts acnts(get_self(), owner.value);
    auto ait = acnts.find(sym.code().raw());
    if(ait != acnts.end() && ait->balance.amount != 0) return;
    flexers table(get_self(), sym.code().raw());
    auto fit = table.find(owner.value);
    if(fit != table.end()) table.erase(fit);
}//END drop_flexer_if_empty()

void easyflex::require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user) {
    bool ok = has_auth(get_self()) || has_auth(st.issuer) ||
              (conf.admin_account.value && has_auth(conf.admin_account)) ||
              (optional_user.value && has_auth(optional_user));
    check(ok, "⟁ Missing required signing authority");
}//END require_token_auth()

void easyflex::maybe_apply_unlock_fee(launches_table& launches, launches_table::const_iterator launch_it, bool force_alcor) {
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

// === Core token lifecycle === //

ACTION easyflex::create(const name& issuer, const asset& maximum_supply) {
    require_auth(issuer);
    check(is_account(issuer), "⟁ Issuer account does not exist");
    auto sym = maximum_supply.symbol;
    check(sym.is_valid() && maximum_supply.is_valid() && maximum_supply.amount > 0, "⟁ Invalid symbol/supply");

    stats statstable(get_self(), sym.code().raw());
    check(statstable.find(sym.code().raw()) == statstable.end(), "⟁ A token with symbol already exists.");

    statstable.emplace(issuer, [&](auto& s) {
        s.supply.symbol = sym;
        s.max_supply = maximum_supply;
        s.issuer = issuer;
        s.reflection_pool = s.burn_pool = asset{0, sym};
    });

    settings_table config(get_self(), sym.code().raw());
    if(config.find(sym.code().raw()) == config.end()) {
        config.emplace(issuer, [&](auto& c) {
            c.token_symbol = sym;
            c.limit = 100;
            c.reflection_rate = 0;
            c.burn_rate = 0;
            c.admin_account = issuer;
        });
    }
}//END create()

ACTION easyflex::issue(const name& to, const asset& quantity, const string& memo) {
    check(quantity.symbol.is_valid() && memo.size() <= 256, "⟁ Invalid issue data");
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
}//END issue()

ACTION easyflex::burn(const name& username, const asset& quantity, const string& memo) {
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

ACTION easyflex::open(const name& owner, const symbol& symbol, const name& ram_payer) {
    require_auth(ram_payer);
    check(is_account(owner), "⟁ owner account does not exist");
    stats statstable(get_self(), symbol.code().raw());
    check(statstable.get(symbol.code().raw(), "⟁ symbol does not exist").supply.symbol == symbol, "⟁ Symbol precision mismatch");
    accounts acnts(get_self(), owner.value);
    if(acnts.find(symbol.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, symbol}; });
}//END open()

ACTION easyflex::close(const name& owner, const symbol& symbol) {
    require_auth(owner);
    accounts acnts(get_self(), owner.value);
    auto it = acnts.find(symbol.code().raw());
    check(it != acnts.end() && it->balance.amount == 0, "⟁ Cannot close (missing or non-zero balance)");
    acnts.erase(it);
    drop_flexer_if_empty(owner, symbol);
}//END close()

ACTION easyflex::transfer(const name& from, const name& to, const asset& quantity, const string& memo) {
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

    const bool is_dist = (from == get_self());
    const bool from_alcor = (from == "alcor"_n || from == "swap.alcor"_n || from == "mon3y"_n);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(sym.raw());
    const bool launched = launch_it != launches.end() && launch_it->launched;
    const bool to_alcor = (to == SWAP_ALCOR);
    if(!launched && !to_alcor && !is_dist && !from_alcor)
        check(false, "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");

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

        total_deduction = from_alcor ? quantity : quantity + reflection_fee + burn_fee;
        if(from_row.balance.amount < total_deduction.amount) {
            total_deduction = from_row.balance;
            int64_t rem = total_deduction.amount - reflection_fee.amount - burn_fee.amount;
            actual_transfer = asset{rem > 0 ? rem : 0, quantity.symbol};
        } else if(from_alcor) {
            actual_transfer = asset{quantity.amount - reflection_fee.amount - burn_fee.amount, quantity.symbol};
        }

        add_balance(get_self(), reflection_fee, get_self());
        if(burn_fee.amount > 0) add_balance(get_self(), burn_fee, get_self());

        statstable.modify(st, same_payer, [&](auto& s) {
            s.reflection_pool += reflection_fee;
            if(!from_alcor) s.burn_pool += burn_fee;
        });
    }

    sub_balance(from, total_deduction);
    add_balance(to, actual_transfer, payer);
    update_flex_balance(from, -total_deduction, from);
    update_flex_balance(to, actual_transfer, payer);
}//END transfer()

ACTION easyflex::setconfig(const symbol& sym, const std::optional<uint64_t>& start_key, const std::optional<uint32_t>& limit,
                           const std::optional<uint16_t>& reflection_rate, const std::optional<uint16_t>& burn_rate,
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
ACTION easyflex::setfees(const symbol& sym, uint16_t reflection_rate, uint16_t burn_rate) {
    stats statstable(get_self(), sym.code().raw());
    const auto& st = statstable.get(sym.code().raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");
    check(sym.is_valid() && st.supply.symbol == sym, "⟁ Bad symbol");

    settings_table config(get_self(), sym.code().raw());
    auto itr = config.find(sym.code().raw());
    check(itr != config.end(), "⟁ Distribution config not set");
    const uint32_t old_sum = (uint32_t)itr->reflection_rate + itr->burn_rate;
    const uint32_t new_sum = (uint32_t)reflection_rate + burn_rate;
    check(new_sum <= 10000, "⟁ Total fees cannot exceed 100%");
    if(old_sum > 0) {
        check(new_sum <= old_sum, "⟁ Total tax cannot increase");
        check(reflection_rate >= itr->reflection_rate, "⟁ Reflection cannot go down");
    }
    config.modify(itr, same_payer, [&](auto& c) {
        c.reflection_rate = reflection_rate;
        c.burn_rate = burn_rate;
    });
}//END setfees()

ACTION easyflex::setmin(const string& token_symbol, int64_t reflect_min) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    check(reflect_min >= 0, "⟁ reflect_min cannot be negative");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    auto conf_it = config.find(code.raw());
    check(conf_it != config.end(), "Distribution config not set");
    require_token_auth(st, *conf_it);
    config.modify(conf_it, same_payer, [&](auto& c) { c.reflect_min = reflect_min; });
}//END setmin()

ACTION easyflex::feeoptout(const name& account, const bool& ban_status, const string& token_symbol) {
    check(is_account(account) && !token_symbol.empty(), "⟁ bad feeoptout data");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    settings_table config(get_self(), code.raw());
    const auto& conf = config.get(code.raw(), "Distribution config not set");

    if(has_auth(account)) check(ban_status, "⟁ you can remove fees, not add them back. 🤷 flex.report");
    else require_token_auth(st, conf);

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, account, st.supply.symbol, get_self());
    flex_table.modify(itr, same_payer, [&](auto& f) { f.fee_opted_out = ban_status; });
}//END feeoptout()

ACTION easyflex::makeitrain(const string& token_symbol, const name& sender) {
    require_auth(sender);
    check(is_account(sender), "⟁ sender account does not exist");
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
    check(std_pay >= min_pool || partner.amount,
          "⟁ " + asset{std_pay, sym}.to_string() + " / " + asset{min_pool, sym}.to_string()
              + " needed to make it rain");

    flexers flex_table(get_self(), code.raw());
    flexpools pools(get_self(), code.raw());

    asset total_supply = get_supply(get_self(), code);
    asset alcor{0, sym};
    for(name a : {"alcor"_n, "mon3y"_n, "swap.alcor"_n}) {
        accounts ac(get_self(), a.value);
        auto it = ac.find(code.raw());
        if(it != ac.end()) alcor += it->balance;
    }
    total_supply -= alcor;
    check(total_supply.amount > 0, "⟁ adjusted total supply must be positive");
    int64_t denom = total_supply.amount;

    asset std_paid{0, sym};

    if(partner.amount > 0) {
        if(nyra.amount > 0) {
            open_holder_ram("nyra"_n, sym, sender);
            add_balance("nyra"_n, nyra, sender);
            update_flex_balance("nyra"_n, nyra, sender);
        }
        if(reflc.amount > 0) {
            open_holder_ram("reflections"_n, sym, sender);
            add_balance("reflections"_n, reflc, sender);
            update_flex_balance("reflections"_n, reflc, sender);
        }
        sub_balance(get_self(), partner);
        update_flex_balance(get_self(), -partner, sender);
    }

    auto itr = conf.start_key == 0 ? flex_table.begin() : flex_table.lower_bound(conf.start_key);
    uint32_t processed = 0;
    if(std_pay >= one) {
        int64_t remaining = std_pay;
        while(itr != flex_table.end() && processed < conf.limit && remaining > 0) {
            if(itr->owner != get_self() && !itr->fee_opted_out &&
               itr->balance.symbol == sym && itr->balance.amount >= one) {
                int64_t share_amt = (int64_t)((__int128)std_pay * itr->balance.amount / denom);
                if(share_amt > remaining) share_amt = remaining;
                if(share_amt > 0) {
                    string memo = "Reflection · flex.forex  · ";
                    name to = itr->owner;
                    uint64_t pid = itr->flex_reward_pool_id;
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
                        memo = "swapexactin#" + std::to_string(oid) + "#" + itr->owner.to_string() + "#" +
                               min_amount + " " + out->code().to_string() + "@" +
                               ocon.to_string() + "#0#reflections";
                        to = "swap.alcor"_n;
                    }
                    check(memo.size() <= 256, "⟁ memo has more than 256 bytes");
                    open_holder_ram(to, sym, sender);
                    action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
                           std::make_tuple(get_self(), to, asset{share_amt, sym}, memo)).send();
                    std_paid += asset{share_amt, sym};
                    remaining -= share_amt;
                }
            }
            ++itr;
            ++processed;
        }
    }

    asset debit = partner + std_paid;
    st = statstable.find(code.raw());
    asset burn_qty = st->burn_pool;

    if(debit.amount > 0)
        statstable.modify(st, same_payer, [&](auto& s) {
            if(s.reflection_pool.amount >= debit.amount) s.reflection_pool -= debit;
            else s.reflection_pool.amount = 0;
        });

    if(std_pay >= one) {
        st = statstable.find(code.raw());
        burn_qty = st->burn_pool;
        if(burn_qty.amount)
            statstable.modify(st, same_payer, [&](auto& s) { s.burn_pool.amount = 0; });
        if(burn_qty.amount > 0)
            action(permission_level{get_self(), "active"_n}, get_self(), "burn"_n,
                   std::make_tuple(get_self(), burn_qty,
                       string("Burn " + std::to_string(conf.burn_rate/100) + "% of every transaction 🔥"))).send();
        config.modify(conf_it, same_payer, [&](auto& c) {
            c.start_key = (itr == flex_table.end()) ? 0 : itr->owner.value;
        });
    }
}//END makeitrain()

ACTION easyflex::startlaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
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

ACTION easyflex::liftoff(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper) {
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

ACTION easyflex::checklock(const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end() && launch_it->launched,
          "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");
    maybe_apply_unlock_fee(launches, launch_it, true);
}//END checklock()

ACTION easyflex::addpool(const uint64_t& pool_id, const string& token_symbol, const symbol& output_symbol,
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

ACTION easyflex::choosereward(const name& owner, const string& token_symbol, const symbol& output_symbol,
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

    auto itr = ensure_flexer(flex_table, owner, st.supply.symbol, get_self());
    flex_table.modify(itr, same_payer, [&](auto& f) { f.flex_reward_pool_id = matching_id; });
}//END choosereward()

} /// namespace eosio
