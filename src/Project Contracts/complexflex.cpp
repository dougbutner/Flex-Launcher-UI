#include "complexflex.hpp"
#include "include/alcorswap_interface.hpp"
#include <cstdint>
#include <vector>
#include <eosio/system.hpp>

//contractName:complexflex

namespace eosio {

// === Balance helpers (eosio.token) === //

void complexflex::sub_balance(const name& owner, const asset& value) {
    accounts from_acnts(get_self(), owner.value);
    const auto& from = from_acnts.get(value.symbol.code().raw(), "no balance object found");
    check(from.balance.amount >= value.amount, "⟁ Overdrawn balance. Ensure you can pay the amount + fee. ");
    from_acnts.modify(from, owner, [&](auto& a) { a.balance -= value; });
}//END sub_balance()

void complexflex::add_balance(const name& owner, const asset& value, const name& ram_payer) {
    accounts to_acnts(get_self(), owner.value);
    auto to = to_acnts.find(value.symbol.code().raw());
    if(to == to_acnts.end())
        to_acnts.emplace(ram_payer, [&](auto& a) { a.balance = value; });
    else
        to_acnts.modify(to, same_payer, [&](auto& a) { a.balance += value; });
}//END add_balance()

void complexflex::update_flex_balance(const name& owner, const asset& value, const name& ram_payer) {
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
        flex_acnts.modify(flex_it, same_payer, [&](auto& a) {
            a.balance = actual;
            if(!a.beneficiary.value) a.beneficiary = a.owner;
        });
    }
}//END update_flex_balance()

complexflex::flexers::const_iterator complexflex::ensure_flexer(flexers& table, const name& owner,
                                                               const symbol& sym, const name& ram_payer) {
    auto itr = table.find(owner.value);
    if(itr != table.end()) return itr;
    return table.emplace(ram_payer, [&](auto& f) {
        f.owner = owner;
        f.balance = asset{0, sym};
        f.beneficiary = owner;
        f.bene_rate = 10000;
    });
}//END ensure_flexer()

void complexflex::open_holder_ram(const name& owner, const symbol& sym, const name& ram_payer) {
    accounts acnts(get_self(), owner.value);
    if(acnts.find(sym.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, sym}; });
    flexers table(get_self(), sym.code().raw());
    ensure_flexer(table, owner, sym, ram_payer);
}//END open_holder_ram()

void complexflex::drop_flexer_if_empty(const name& owner, const symbol& sym) {
    accounts acnts(get_self(), owner.value);
    auto ait = acnts.find(sym.code().raw());
    if(ait != acnts.end() && ait->balance.amount != 0) return;
    flexers table(get_self(), sym.code().raw());
    auto fit = table.find(owner.value);
    if(fit != table.end()) table.erase(fit);
}//END drop_flexer_if_empty()

void complexflex::require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user) {
    bool ok = has_auth(get_self()) || has_auth(st.issuer) ||
              (conf.admin_account.value && has_auth(conf.admin_account)) ||
              (optional_user.value && has_auth(optional_user));
    check(ok, "⟁ Missing required signing authority");
}//END require_token_auth()

void complexflex::maybe_apply_unlock_fee(launches_table& launches, launches_table::const_iterator launch_it, bool force_alcor) {
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

ACTION complexflex::create(const name& issuer, const asset& maximum_supply) {
    require_auth(issuer);
    check(is_account(issuer), "⟁ Issuer account does not exist");
    auto sym = maximum_supply.symbol;
    check(sym.is_valid() && maximum_supply.is_valid() && maximum_supply.amount > 0, "⟁ Invalid symbol/supply");
    {
        const auto sc = sym.code();
        check(sc != symbol_code("EASY") && sc != symbol_code("GRAMS") && sc != symbol_code("MEME") &&
                  sc != symbol_code("WON") && sc != symbol_code("XPR") && sc != symbol_code("XMD") &&
                  sc != symbol_code("LOAN"),
              "⟁ EASY, GRAMS, MEME, WON, XPR, XMD, and LOAN are reserved");
    }

    stats statstable(get_self(), sym.code().raw());
    check(statstable.find(sym.code().raw()) == statstable.end(),
          "⟁ A token with symbol already exists in the FLEX ecosystem");
    {
        struct other_stat {
            asset    supply;
            uint64_t primary_key() const { return supply.symbol.code().raw(); }
        };
        const uint64_t raw = sym.code().raw();
        for(const name acct : {XPR_EASYFLEX, XPR_COMPLEXFLEX, XPR_FLEXFOREX, XTOKENS}) {
            if(acct == get_self()) continue;
            multi_index<"stat"_n, other_stat> others(acct, raw);
            check(others.find(raw) == others.end(),
                  "⟁ A token with symbol already exists in the FLEX ecosystem");
        }
    }

    statstable.emplace(issuer, [&](auto& s) {
        s.supply.symbol = sym;
        s.max_supply = maximum_supply;
        s.issuer = issuer;
        s.reflection_pool = s.burn_pool = s.project_pool = asset{0, sym};
    });

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

ACTION complexflex::mint(const name& to, const asset& quantity, const string& memo) {
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

ACTION complexflex::burn(const name& username, const asset& quantity, const string& memo) {
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

ACTION complexflex::open(const name& owner, const symbol& symbol, const name& ram_payer) {
    require_auth(ram_payer);
    check(is_account(owner), "owner account does not exist");
    stats statstable(get_self(), symbol.code().raw());
    check(statstable.get(symbol.code().raw(), "symbol does not exist").supply.symbol == symbol, "⟁ Symbol precision mismatch");
    accounts acnts(get_self(), owner.value);
    if(acnts.find(symbol.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, symbol}; });
}//END open()

ACTION complexflex::close(const name& owner, const symbol& symbol) {
    require_auth(owner);
    accounts acnts(get_self(), owner.value);
    auto it = acnts.find(symbol.code().raw());
    check(it != acnts.end() && it->balance.amount == 0, "Cannot close (missing or non-zero balance)");
    acnts.erase(it);
    drop_flexer_if_empty(owner, symbol);
}//END close()

ACTION complexflex::transfer(const name& from, const name& to, const asset& quantity, const string& memo) {
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

    const bool is_dist = (from == get_self() || from == XPR_EASYFLEX || from == XPR_COMPLEXFLEX || from == XPR_FLEXFOREX);
    const bool from_alcor = (from == "alcor"_n || from == SWAP_ALCOR);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(sym.raw());
    const bool launched = launch_it != launches.end() && launch_it->launched;
    const bool to_alcor = (to == SWAP_ALCOR);
    if(!launched)
        enforce_presale(from, to, quantity, memo, st.issuer, sym, st.supply.amount);

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

        total_deduction = from_alcor ? quantity : quantity + reflection_fee + burn_fee + project_fee;
        if(from_row.balance.amount < total_deduction.amount) {
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
            s.reflection_pool += reflection_fee;
            if(!from_alcor) s.burn_pool += burn_fee;
            s.project_pool += project_fee;
        });
    }

    sub_balance(from, total_deduction);
    add_balance(to, actual_transfer, payer);
    update_flex_balance(from, -total_deduction, from);
    update_flex_balance(to, actual_transfer, payer);
}//END transfer()

ACTION complexflex::setconfig(const symbol& sym, const std::optional<uint64_t>& start_key, const std::optional<uint32_t>& limit,
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
ACTION complexflex::setfees(const symbol& sym, uint16_t reflection_rate, uint16_t burn_rate, uint16_t project_rate,
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

ACTION complexflex::setmin(const string& token_symbol, int64_t reflect_min) {
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

ACTION complexflex::feeoptout(const name& account, const bool& ban_status, const string& token_symbol) {
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

ACTION complexflex::makeitrain(const string& token_symbol, const name& sender,
                              const std::optional<int64_t>& min_hold,
                              const std::optional<int64_t>& min_pool) {
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
    int64_t hold_req = min_hold.value_or(0);
    int64_t hold_floor = hold_req > 0 ? hold_req : one;
    int64_t pool_req = min_pool.value_or(0);
    if(pool_req > 0)
        check(st->reflection_pool.amount >= pool_req,
              "⟁ " + asset{st->reflection_pool.amount, sym}.to_string() + " / "
                  + asset{pool_req, sym}.to_string() + " needed in the reflection pool");
    int64_t pay_floor = conf.reflect_min > 0 ? conf.reflect_min : one;

    int64_t standard = st->reflection_pool.amount;
    asset nyra{(standard * launch_it->dev_bps) / 10000, sym};
    asset reflc{(standard * launch_it->club_bps) / 10000, sym};
    asset partner = nyra + reflc;
    if(partner.amount > 0 && partner.amount <= standard) standard -= partner.amount;
    else { nyra.amount = 0; reflc.amount = 0; partner.amount = 0; }

    int64_t std_pay = (standard * PAY_NUM) / PAY_DEN;
    check(std_pay >= pay_floor || partner.amount,
          "⟁ " + asset{std_pay, sym}.to_string() + " / " + asset{pay_floor, sym}.to_string()
              + " needed to make it rain");

    flexers flex_table(get_self(), code.raw());
    flexpools pools(get_self(), code.raw());

    asset total_supply = get_supply(get_self(), code);
    asset alcor{0, sym};
    for(name a : {"alcor"_n, "swap.alcor"_n}) {
        accounts ac(get_self(), a.value);
        auto it = ac.find(code.raw());
        if(it != ac.end()) alcor += it->balance;
    }
    total_supply -= alcor;
    check(total_supply.amount > 0, "⟁ adjusted total supply must be positive");
    int64_t denom = total_supply.amount;

    asset std_paid{0, sym};

    auto send_share = [&](const flexer& row, asset share) {
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
            open_holder_ram(to, sym, sender);
            action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
                   std::make_tuple(get_self(), to, amount, memo)).send();
            std_paid += amount;
        };
        pay(bene, tree, true);
        pay(row.owner, hold, false);
    };

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
            if(itr->owner != get_self() && itr->owner != "alcor"_n && itr->owner != SWAP_ALCOR &&
               !itr->fee_opted_out &&
               itr->balance.symbol == sym && itr->balance.amount >= hold_floor) {
                int64_t share = (int64_t)((__int128)std_pay * itr->balance.amount / denom);
                if(share > remaining) share = remaining;
                send_share(*itr, asset{share, sym});
                remaining -= share;
            }
            ++itr;
            ++processed;
        }
    }

    asset debit = partner + std_paid;
    st = statstable.find(code.raw());
    asset burn_qty = st->burn_pool;
    name project_acct = conf.project_account;
    asset project_qty = st->project_pool;

    if(debit.amount > 0)
        statstable.modify(st, same_payer, [&](auto& s) {
            if(s.reflection_pool.amount >= debit.amount) s.reflection_pool -= debit;
            else s.reflection_pool.amount = 0;
        });

    if(std_pay >= one) {
        st = statstable.find(code.raw());
        burn_qty = st->burn_pool;
        project_qty = st->project_pool;
        if(burn_qty.amount || project_qty.amount)
            statstable.modify(st, same_payer, [&](auto& s) {
                s.burn_pool.amount = 0;
                s.project_pool.amount = 0;
            });
    }

    if(std_pay >= one && burn_qty.amount > 0)
        action(permission_level{get_self(), "active"_n}, get_self(), "burn"_n,
               std::make_tuple(get_self(), burn_qty,
                   string("Burn " + std::to_string(conf.burn_rate/100) + "% of every transaction 🔥"))).send();
    if(std_pay >= one && project_qty.amount > 0 && project_acct.value && project_acct != get_self()) {
        open_holder_ram(project_acct, sym, sender);
        action(permission_level{get_self(), "active"_n}, get_self(), "transfer"_n,
               std::make_tuple(get_self(), project_acct, project_qty,
                   string("Project " + std::to_string(conf.project_rate/100.0) + "% For Team · flex.forex ·"))).send();
    }

    if(std_pay >= one)
        config.modify(conf_it, same_payer, [&](auto& c) {
            c.start_key = (itr == flex_table.end()) ? 0 : itr->owner.value;
        });
}//END makeitrain()

ACTION complexflex::startlaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
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
    check(itr == launches.end() || (!itr->launched && !itr->pure_liquid_alcor_pool_id), "⟁ already lifted off; launch params are locked");

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

ACTION complexflex::liftoff(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    require_auth(st.issuer);

    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end(), "⟁ startlaunch first");
    check(!launch_it->launched && !launch_it->pure_liquid_alcor_pool_id, "⟁ already lifted off");
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

    presales_table ps(get_self(), code.raw());
    const bool live = ps.find(code.raw()) == ps.end();
    const uint16_t bps = launch_it->flex_quote ? 0 : PROTO_BPS_HALF;
    launches.modify(launch_it, same_payer, [&](auto& row) {
        row.launched = live;
        row.pure_liquid_alcor_pool_id = pool_id;
        row.position_id = pos.id;
        row.dev_bps = bps;
        row.club_bps = bps;
        row.unlock_time = unlock;
    });
}//END liftoff()

ACTION complexflex::checklock(const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end() && launch_it->launched,
          "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");
    maybe_apply_unlock_fee(launches, launch_it, true);
}//END checklock()

ACTION complexflex::golive(const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end() && launch_it->pure_liquid_alcor_pool_id, "⟁ liftoff first");
    check(!launch_it->launched, "⟁ already lifted off");
    launches.modify(launch_it, same_payer, [&](auto& row) { row.launched = true; });
}//END golive()

ACTION complexflex::addpool(const uint64_t& pool_id, const string& token_symbol, const symbol& output_symbol,
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

ACTION complexflex::choosereward(const name& owner, const string& token_symbol, const symbol& output_symbol,
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

ACTION complexflex::inheritance(const name& flexer, const name& beneficiary, const uint16_t& rate, const string& token_symbol) {
    check(has_auth(flexer) || has_auth(get_self()), "⟁ missing authority");
    check(rate <= 10000 && !token_symbol.empty(), "⟁ bad inheritance data");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    name bene = beneficiary.value ? beneficiary : flexer;
    check(is_account(bene), "⟁ beneficiary account does not exist");

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, flexer, st.supply.symbol,
                             has_auth(get_self()) ? get_self() : flexer);
    flex_table.modify(itr, same_payer, [&](auto& f) { f.beneficiary = bene; f.bene_rate = rate; });
}//END inheritance()

ACTION complexflex::inheritmemo(const name& flexer, const string& custom_memo, const string& token_symbol) {
    check(has_auth(flexer) || has_auth(get_self()), "⟁ missing authority");
    check(custom_memo.size() <= 200 && !token_symbol.empty(), "⟁ bad inheritmemo data");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, flexer, st.supply.symbol,
                             has_auth(get_self()) ? get_self() : flexer);
    flex_table.modify(itr, same_payer, [&](auto& f) { f.custom_memo = custom_memo; });
}//END inheritmemo()

// === Presale / insider window === //

void complexflex::parse_add_insiders(insiders_table& table, const string& accounts, const name& ram_payer) {
    string compact;
    compact.reserve(accounts.size());
    for(char c : accounts)
        if(c != ' ' && c != '\t') compact += c;
    size_t i = 0;
    while(i < compact.size()) {
        size_t j = compact.find(',', i);
        if(j == string::npos) j = compact.size();
        if(j > i) {
            string part = compact.substr(i, j - i);
            check(part.size() <= 13, "⟁ bad insider name");
            name acc(part);
            check(is_account(acc), "⟁ insider account does not exist");
            auto it = table.find(acc.value);
            if(it == table.end())
                table.emplace(ram_payer, [&](auto& r) {
                    r.account = acc;
                    r.approved = true;
                    r.source = 0;
                });
            else
                table.modify(it, same_payer, [&](auto& r) {
                    r.approved = true;
                    r.source = 0;
                });
        }
        i = j + 1;
    }
}//END parse_add_insiders()

bool complexflex::presale_gates_ok(const name& account, const presale& cfg, const insider* row, const symbol_code& sym) {
    bool any = false;

    if(cfg.collection.value) {
        any = true;
        // backed_tokens is ABI only — we count collection+schema, never backing.
        struct aa_asset {
            uint64_t           asset_id;
            name               collection_name;
            name               schema_name;
            int32_t            template_id;
            name               ram_payer;
            std::vector<asset> backed_tokens;
            std::vector<uint8_t> immutable_serialized_data;
            std::vector<uint8_t> mutable_serialized_data;
            uint64_t primary_key() const { return asset_id; }
        };
        multi_index<"assets"_n, aa_asset> assets("atomicassets"_n, account.value);
        uint32_t need = cfg.nft_min ? cfg.nft_min : 1;
        uint32_t n = 0;
        for(auto i = assets.begin(); i != assets.end(); ++i)
            if(i->collection_name == cfg.collection && i->schema_name == cfg.schema)
                if(++n >= need) return true;
    }

    if(cfg.min_token.quantity.amount > 0) {
        any = true;
        struct token_account {
            asset    balance;
            uint64_t primary_key() const { return balance.symbol.code().raw(); }
        };
        multi_index<"accounts"_n, token_account> ac(cfg.min_token.contract, account.value);
        auto bit = ac.find(cfg.min_token.quantity.symbol.code().raw());
        if(bit != ac.end() && bit->balance.symbol == cfg.min_token.quantity.symbol &&
           bit->balance.amount >= cfg.min_token.quantity.amount)
            return true;
    }

    if(cfg.lp_min > 0) {
        any = true;
        launches_table launches(get_self(), get_self().value);
        auto lit = launches.find(sym.raw());
        if(lit != launches.end() && lit->pure_liquid_alcor_pool_id) {
            alcor::positions_t pos(SWAP_ALCOR, lit->pure_liquid_alcor_pool_id);
            auto byown = pos.get_index<"buyowner"_n>();
            int64_t liq = 0;
            for(auto i = byown.lower_bound(account.value); i != byown.end() && i->owner == account; ++i)
                liq += (int64_t)i->liquidity;
            if(liq >= cfg.lp_min) return true;
        }
    }

    // locked_lp_min / locked_pos are provelock proof only — not a buy gate.
    (void)row;
    return !any;
}//END presale_gates_ok()

int64_t complexflex::presale_cap(const name& account, const presale& cfg, const insider* row, int64_t supply) {
    if(account == get_self() || account == SWAP_ALCOR || account == "alcor"_n) return 0x7FFFFFFFFFFFFFFF;
    uint16_t bps = (row && row->locked_pos && cfg.locked_insider_bps) ? cfg.locked_insider_bps : cfg.insider_bps;
    if(!bps || supply <= 0) return 0;
    return (int64_t)((__int128)supply * bps / 10000);
}//END presale_cap()

void complexflex::enforce_presale(const name& from, const name& to, const asset& quantity, const string& memo, const name& issuer, const symbol_code& sym, int64_t supply) {
    const bool to_alcor = (to == SWAP_ALCOR);
    const bool from_alcor = (from == SWAP_ALCOR || from == "alcor"_n);
    presales_table p(get_self(), sym.raw());
    auto it = p.find(sym.raw());
    if(it == p.end()) {
        check(to_alcor, "⟁ Place a one-sided Alcor range, lock ≥ 90 days, then liftoff to activate this token");
        return;
    }
    if(from == issuer && to_alcor) return;
    if(to == issuer) return;

    uint32_t now = current_time_point().sec_since_epoch();
    uint32_t open_d = (it->launch_time > now ? it->launch_time - now : 0) / (24 * 60 * 60);
    string open = std::to_string(it->launch_time) + " · " + std::to_string(open_d) + "d";
    if(it->mode == PS_FREEZE)
        check(false, "⟁ presale freeze · " + open);

    insiders_table ins(get_self(), sym.raw());
    if(to_alcor) {
        check(now >= it->insider_time,
              "⟁ presale not open · " + std::to_string(it->insider_time) + " · " + std::to_string((it->insider_time > now ? it->insider_time - now : 0) / (24 * 60 * 60)) + "d");
        check(now < it->launch_time, "⟁ sells locked · " + open);
        check(memo.size() >= 3 && memo.compare(0, 3, "dep") == 0, "⟁ deposit memo required");
        auto iit = ins.find(from.value);
        check(iit != ins.end() && iit->approved, "⟁ not an insider");
        return;
    }
    if(from == issuer || from_alcor) {
        if(from_alcor)
            check(now >= it->launch_time, "⟁ presale not open · " + open);
        auto iit = ins.find(to.value);
        check(iit != ins.end() && iit->approved, "⟁ not an insider");
        if(from_alcor) {
            int64_t cap = presale_cap(to, *it, &(*iit), supply);
            accounts ac(get_self(), to.value);
            auto ait = ac.find(sym.raw());
            int64_t have = ait == ac.end() ? 0 : ait->balance.amount;
            check(have + quantity.amount <= cap, "⟁ insider cap · " + std::to_string(cap));
        }
        return;
    }
    check(false, "⟁ sells locked · " + open);
}//END enforce_presale()

ACTION complexflex::setpresale(const string& token_symbol, uint32_t launch_time, uint32_t insider_time,
                               uint8_t mode, uint16_t insider_bps, uint16_t locked_insider_bps,
                               const name& collection, const name& schema, uint32_t nft_min,
                               const extended_asset& min_token,
                               int64_t lp_min, int64_t locked_lp_min, uint32_t lock_secs) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");

    launches_table launches(get_self(), get_self().value);
    auto lit = launches.find(code.raw());
    check(lit == launches.end() || !lit->launched, "⟁ already lifted off");
    check(insider_time > 0 && launch_time > insider_time, "⟁ insider_time must precede launch_time");
    check(mode <= PS_BUY_LP_IN, "⟁ bad presale mode");
    check(insider_bps <= 10000 && locked_insider_bps <= 10000, "⟁ bps > 100%");
    if(locked_insider_bps)
        check(locked_insider_bps >= insider_bps, "⟁ locked_insider_bps must be ≥ insider_bps");
    if(collection.value || schema.value)
        check(collection.value && schema.value, "⟁ NFT gate needs collection and schema");
    if(locked_lp_min > 0 || lock_secs > 0)
        check(lock_secs + PRESALE_LOCK_SLACK <= MIN_LOCK_SECS, "⟁ insider lock must be ≥ 3d shorter than 90d main lock");
    extended_asset mt{};
    if(min_token.quantity.amount > 0) {
        check(is_account(min_token.contract), "⟁ min_token contract does not exist");
        check(min_token.quantity.symbol.is_valid(), "⟁ min_token symbol invalid");
        mt = min_token;
    }

    name ram_payer = has_auth(get_self()) ? get_self() : st.issuer;
    presales_table p(get_self(), code.raw());
    auto it = p.find(code.raw());
    auto write = [&](auto& r) {
        r.token_symbol = st.supply.symbol;
        r.launch_time = launch_time;
        r.insider_time = insider_time;
        r.mode = mode;
        r.insider_bps = insider_bps;
        r.locked_insider_bps = locked_insider_bps;
        r.collection = collection;
        r.schema = schema;
        r.nft_min = collection.value && !nft_min ? 1 : nft_min;
        r.min_token = mt;
        r.lp_min = lp_min;
        r.locked_lp_min = locked_lp_min;
        r.lock_secs = lock_secs;
    };
    if(it == p.end()) p.emplace(ram_payer, write);
    else p.modify(it, same_payer, write);
}//END setpresale()

ACTION complexflex::setlaunchtime(const string& token_symbol,
                                  const std::optional<uint32_t>& launch_time,
                                  const std::optional<uint32_t>& insider_time) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");

    presales_table p(get_self(), code.raw());
    auto it = p.find(code.raw());
    check(it != p.end(), "⟁ presale not set");
    uint32_t now = current_time_point().sec_since_epoch();
    const bool as_self = has_auth(get_self());
    if(!as_self && now >= it->launch_time)
        check(false, "⟁ launch window locked");
    uint32_t new_l = launch_time.value_or(it->launch_time);
    uint32_t new_i = insider_time.value_or(it->insider_time);
    check(new_i > 0 && new_l > new_i, "⟁ insider_time must precede launch_time");
    if(!as_self) {
        check(new_l >= it->launch_time, "⟁ cannot pull launch_time forward");
        if(now >= it->insider_time)
            check(new_i >= it->insider_time, "⟁ cannot pull insider_time forward");
    }
    p.modify(it, same_payer, [&](auto& r) {
        r.launch_time = new_l;
        r.insider_time = new_i;
    });
}//END setlaunchtime()

ACTION complexflex::addinsiders(const string& token_symbol, const string& accounts) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");
    insiders_table ins(get_self(), code.raw());
    parse_add_insiders(ins, accounts, has_auth(get_self()) ? get_self() : st.issuer);
}//END addinsiders()

ACTION complexflex::reginsider(const name& owner, const string& token_symbol) {
    require_auth(owner);
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    statstable.get(code.raw(), "⟁ token with symbol does not exist");
    presales_table p(get_self(), code.raw());
    const auto& cfg = p.get(code.raw(), "⟁ presale not set");
    uint32_t now = current_time_point().sec_since_epoch();
    check(now >= cfg.insider_time,
          "⟁ presale not open · " + std::to_string(cfg.insider_time) + " · " + std::to_string((cfg.insider_time > now ? cfg.insider_time - now : 0) / (24 * 60 * 60)) + "d");
    insiders_table ins(get_self(), code.raw());
    auto iit = ins.find(owner.value);
    const insider* row = iit == ins.end() ? nullptr : &(*iit);
    check(presale_gates_ok(owner, cfg, row, code), "⟁ presale gates");
    if(iit == ins.end())
        ins.emplace(owner, [&](auto& r) {
            r.account = owner;
            r.approved = true;
            r.source = 1;
        });
    else
        ins.modify(iit, same_payer, [&](auto& r) { r.approved = true; });
}//END reginsider()

ACTION complexflex::rminsider(const name& account, const string& token_symbol) {
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "⟁ token with symbol does not exist");
    check(has_auth(get_self()) || has_auth(st.issuer), "⟁ missing issuer or contract authority");
    insiders_table ins(get_self(), code.raw());
    auto it = ins.find(account.value);
    check(it != ins.end(), "⟁ insider not found");
    ins.erase(it);
}//END rminsider()

ACTION complexflex::provelock(const name& owner, const string& token_symbol, uint64_t pool_id, uint64_t position_id) {
    require_auth(owner);
    check(!token_symbol.empty(), "⟁ Token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    statstable.get(code.raw(), "⟁ token with symbol does not exist");
    presales_table p(get_self(), code.raw());
    const auto& cfg = p.get(code.raw(), "⟁ presale not set");
    check(cfg.locked_lp_min > 0 || cfg.lock_secs > 0, "⟁ lock proof not configured");
    alcor::positions_t positions(SWAP_ALCOR, pool_id);
    auto pit = positions.find(position_id);
    check(pit != positions.end() && pit->owner == owner, "⟁ position not found");
    check((int64_t)pit->liquidity >= cfg.locked_lp_min, "⟁ LP too small");
    uint32_t unlock = alcor::get_unlock_time(SWAP_ALCOR, position_id);
    uint32_t now = current_time_point().sec_since_epoch();
    check(unlock >= now + cfg.lock_secs,
          "⟁ lock too short · " + std::to_string(now + cfg.lock_secs) + " · " + std::to_string(cfg.lock_secs / (24 * 60 * 60)) + "d");
    insiders_table ins(get_self(), code.raw());
    auto iit = ins.find(owner.value);
    if(iit == ins.end())
        ins.emplace(owner, [&](auto& r) {
            r.account = owner;
            r.locked_pos = position_id;
        });
    else
        ins.modify(iit, same_payer, [&](auto& r) { r.locked_pos = position_id; });
}//END provelock()

} /// namespace eosio
