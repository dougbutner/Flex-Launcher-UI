#include "flexforex.hpp"
#include "include/alcorswap_interface.hpp"
#include <cmath>
#include <cstdint>
#include <vector>
#include <eosio/system.hpp>
#include <eosio/transaction.hpp>

//contractName:flexforex

namespace eosio {

// ---------------------------------------------------------------------------
// Small math / string helpers (no table I/O)
// ---------------------------------------------------------------------------

// Min Alcor swap amount string for a given precision, e.g. 4 → "0.0001"
static string min_amount_str(uint8_t precision) {
    if(precision == 0) return string("1");
    string value = "0" + std::string(precision - 1, '0') + "1";
    value.insert(1, ".");
    return value;
}

static uint32_t now_sec() { return current_time_point().sec_since_epoch(); }

// Only this fraction of a pool is payable per splash (buffer stays in pool).
static int64_t dist_pot(int64_t pool) { return pool * flexforex::DIST_BPS / 10000; }

// Overflow-safe pot * balance / denom  (share = balance / eligible_total)
static int64_t mul_div(int64_t pot, uint64_t w, uint64_t denom) {
    if(!denom) denom = 1;
    return pot / (int64_t)denom * (int64_t)w + (pot % (int64_t)denom) * (int64_t)w / (int64_t)denom;
}

// Pure proportional: weight is the token balance (1 if empty so math never 0/0).
static uint64_t weight_of(int64_t bal_amt) {
    return bal_amt > 0 ? (uint64_t)bal_amt : 1;
}

static void send_tokens(name self, name to, asset qty, const string& memo) {
    action(permission_level{self, "active"_n}, self, "transfer"_n,
           std::make_tuple(self, to, qty, memo)).send();
}

static int32_t spacing_for_fee(uint32_t fee) {
    if(fee == 500) return 10;
    if(fee == 3000) return 60;
    if(fee == 10000) return 200;
    return 0;
}

static bool same_ext(const extended_asset& a, name contract, const symbol& sym) {
    return a.contract == contract && a.quantity.symbol == sym;
}

struct token_account_row {
    asset balance;
    uint64_t primary_key() const { return balance.symbol.code().raw(); }
};
typedef multi_index<"accounts"_n, token_account_row> foreign_accounts;

static int64_t foreign_balance(name token_contract, name owner, const symbol& sym) {
    foreign_accounts ac(token_contract, owner.value);
    auto it = ac.find(sym.code().raw());
    return it == ac.end() ? 0 : it->balance.amount;
}

// amountB ≈ amountA * (sqrtPriceX64)^2 / 2^128  (raw units). Fails closed on overflow.
static int64_t raw_a_in_b(uint64_t amount_a, uint128_t sp) {
    check(sp > 0 && amount_a > 0, "🜚 unpriced or empty Alcor pool");
    const uint128_t mask = (uint128_t(1) << 64) - 1;
    const uint128_t hi = sp >> 64;
    const uint128_t lo = sp & mask;
    uint128_t acc = 0;
    if(hi) {
        check(hi <= uint128_t(~uint64_t(0)) && amount_a <= ~uint64_t(0) / (uint64_t)hi / (uint64_t)hi,
              "🜚 price overflow");
        acc += uint128_t(amount_a) * hi * hi;
    }
    if(hi && lo) {
        uint128_t t = uint128_t(amount_a) * hi;
        check(t <= ~uint128_t(0) / lo, "🜚 price overflow");
        acc += (t * lo) >> 63; // 2*hi*lo*amount / 2^64
    }
    if(lo) {
        uint128_t t = (uint128_t(lo) * lo) >> 64;
        acc += (t * amount_a) >> 64;
    }
    check(acc <= uint128_t(~uint64_t(0) >> 1), "🜚 price overflow");
    return (int64_t)acc;
}

// amountA ≈ amountB * 2^128 / (sqrtPriceX64)^2
static int64_t raw_b_in_a(uint64_t amount_b, uint128_t sp) {
    check(sp > 0 && amount_b > 0, "🜚 unpriced or empty Alcor pool");
    uint128_t q = amount_b;
    uint128_t r1 = (q << 64) / sp;
    uint128_t r2 = (r1 << 64) / sp;
    check(r2 <= uint128_t(~uint64_t(0) >> 1), "🜚 price overflow");
    return (int64_t)r2;
}

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

void flexforex::sub_balance(const name& owner, const asset& value) {
    accounts from_acnts(get_self(), owner.value);
    const auto& from = from_acnts.get(value.symbol.code().raw(), "no balance object found");
    check(from.balance.amount >= value.amount, "overdrawn balance");
    from_acnts.modify(from, owner, [&](auto& a) { a.balance -= value; });
}

void flexforex::add_balance(const name& owner, const asset& value, const name& ram_payer) {
    accounts to_acnts(get_self(), owner.value);
    auto to = to_acnts.find(value.symbol.code().raw());
    if(to == to_acnts.end())
        to_acnts.emplace(ram_payer, [&](auto& a) { a.balance = value; });
    else
        to_acnts.modify(to, same_payer, [&](auto& a) { a.balance += value; });
}

// Keep flexers.balance in sync with accounts; create row + bump flexer_count on first sight.
void flexforex::update_flex_balance(const name& owner, const asset& value) {
    flexers flex_acnts(get_self(), value.symbol.code().raw());
    stats statstable(get_self(), value.symbol.code().raw());
    accounts user_accounts(get_self(), owner.value);
    auto account_it = user_accounts.find(value.symbol.code().raw());
    asset actual = account_it != user_accounts.end() ? account_it->balance : asset{0, value.symbol};

    auto flex_it = flex_acnts.find(owner.value);
    if(flex_it == flex_acnts.end()) {
        ensure_flexer(flex_acnts, statstable, owner, value.symbol, get_self());
        flex_acnts.modify(flex_acnts.find(owner.value), same_payer, [&](auto& a) { a.balance = actual; });
    } else {
        flex_acnts.modify(flex_it, same_payer, [&](auto& a) {
            a.balance = actual;
            if(!a.beneficiary.value) a.beneficiary = a.owner;
        });
    }
}

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
        f.pick = 1000;
    });
    auto st = statstable.find(sym.code().raw());
    if(st != statstable.end())
        statstable.modify(st, same_payer, [&](auto& s) { s.flexer_count += 1; });
    return itr;
}

// Contract, issuer, admin, or optional_user may authorize.
void flexforex::require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user) {
    bool ok = has_auth(get_self()) || has_auth(st.issuer) ||
              (conf.admin_account.value && has_auth(conf.admin_account)) ||
              (optional_user.value && has_auth(optional_user));
    check(ok, "missing required authority");
}

bool flexforex::is_flex_quote(const extended_asset& quote) const {
    const auto code = quote.quantity.symbol.code();
    return (quote.contract == "mon3y"_n && code == symbol_code("EASY")) ||
           (quote.contract == "w3won"_n && code == symbol_code("WON")) ||
           (quote.contract == "m3m3"_n && code == symbol_code("MEME")) ||
           (quote.contract == "gold.mon3y"_n && code == symbol_code("GRAMS"));
}

void flexforex::require_xtoken_tvl(const extended_asset& quote, uint64_t proof_pool_id) const {
    check(quote.contract == XTOKENS, "🜚 quote must be a flex token or xtokens");
    check(proof_pool_id, "🜚 xtoken launches need proof_pool_id vs XUSDC or XPR");
    auto pool = alcor::get_pool(SWAP_ALCOR, proof_pool_id);
    check(pool.active, "🜚 proof pool is not active");
    const symbol qsym = quote.quantity.symbol;
    const bool a_is_q = same_ext(pool.tokenA, XTOKENS, qsym);
    const bool b_is_q = same_ext(pool.tokenB, XTOKENS, qsym);
    check(a_is_q || b_is_q, "🜚 proof pool does not contain that xtoken");

    const symbol xusdc("XUSDC", 6);
    const symbol xpr("XPR", 4);
    const auto& other = a_is_q ? pool.tokenB : pool.tokenA;
    const bool vs_usdc = same_ext(other, XTOKENS, xusdc);
    const bool vs_xpr = same_ext(other, "eosio.token"_n, xpr);
    check(vs_usdc || vs_xpr, "🜚 proof pool must pair the xtoken with XUSDC or XPR");

    int64_t inv = foreign_balance(XTOKENS, SWAP_ALCOR, qsym);
    check(inv > 0 && pool.liquidity > 0, "🜚 no xtoken inventory on swap.alcor");

    const uint128_t sp = pool.currSlot.sqrtPriceX64;
    int64_t quote_raw = 0;
    if(a_is_q) quote_raw = raw_a_in_b((uint64_t)inv, sp);
    else quote_raw = raw_b_in_a((uint64_t)inv, sp);

    int64_t unit = 1;
    uint8_t prec = other.quantity.symbol.precision();
    for(uint8_t i = 0; i < prec; ++i) unit *= 10;
    const int64_t min_raw = vs_usdc ? 10 * unit : 1000 * unit;
    if(vs_usdc) check(quote_raw >= min_raw, "🜚 xtoken needs ≥ 10 XUSDC of Alcor inventory");
    else check(quote_raw >= min_raw, "🜚 xtoken needs ≥ 1000 XPR of Alcor inventory");
}

// ---------------------------------------------------------------------------
// Core token lifecycle
// ---------------------------------------------------------------------------

ACTION flexforex::forge(const name& issuer, const asset& maximum_supply) {
    require_auth(issuer);
    check(is_account(issuer), "🜚 issuer account does not exist");
    auto sym = maximum_supply.symbol;
    check(sym.is_valid() && maximum_supply.is_valid() && maximum_supply.amount > 0, "🜚 invalid symbol/supply");

    stats statstable(get_self(), sym.code().raw());
    check(statstable.find(sym.code().raw()) == statstable.end(), "🜚 token with symbol already exists");

    // Zero all fee pools; Numbers/Luck stay empty until setdist splits fees into them.
    statstable.emplace(issuer, [&](auto& s) {
        s.supply.symbol = sym;
        s.max_supply = maximum_supply;
        s.issuer = issuer;
        s.reflection_pool = s.burn_pool = s.project_pool =
        s.numbers_pool = s.luck_pool = asset{0, sym};
    });

    // Default fees → 100% of reflection fee goes to standard reflections until setdist.
    settings_table config(get_self(), get_self().value);
    if(config.find(sym.code().raw()) == config.end()) {
        config.emplace(issuer, [&](auto& c) {
            c.token_symbol = sym;
            c.limit = 100;
            c.reflection_rate = 100;
            c.project_rate = 100;
            c.project_account = get_self();
            c.admin_account = issuer;
        });
    }
}

ACTION flexforex::mint(const name& to, const asset& quantity, const string& memo) {
    check(quantity.symbol.is_valid() && memo.size() <= 256, "🜚 invalid mint args");
    stats statstable(get_self(), quantity.symbol.code().raw());
    const auto& st = statstable.get(quantity.symbol.code().raw(), "🜚 create token before issue");
    check(to == st.issuer, "🜚 tokens can only be issued to issuer account");
    require_auth(st.issuer);
    check(quantity.is_valid() && quantity.amount > 0, "🜚 must issue positive quantity");
    check(quantity.symbol == st.supply.symbol, "🜚 symbol precision mismatch");
    check(quantity.amount <= st.max_supply.amount - st.supply.amount, "🜚 exceeds max supply");

    statstable.modify(st, same_payer, [&](auto& s) { s.supply += quantity; });
    add_balance(st.issuer, quantity, st.issuer);
    update_flex_balance(st.issuer, quantity);
}

ACTION flexforex::burn(const name& username, const asset& quantity, const string& memo) {
    check(quantity.symbol.is_valid() && memo.size() <= 256, "🜚 invalid burn args");
    stats statstable(get_self(), quantity.symbol.code().raw());
    const auto& st = statstable.get(quantity.symbol.code().raw(), "token with symbol does not exist");
    require_auth(username);
    check(quantity.is_valid() && quantity.amount > 0 && quantity.symbol == st.supply.symbol, "🜚 bad burn qty");

    statstable.modify(st, same_payer, [&](auto& s) { s.supply -= quantity; });
    sub_balance(username, quantity);
    update_flex_balance(username, -quantity);

    accounts acnts(get_self(), username.value);
    auto it = acnts.find(quantity.symbol.code().raw());
    if(it != acnts.end() && it->balance.amount == 0) acnts.erase(it);
}

void flexforex::open(const name& owner, const symbol& symbol, const name& ram_payer) {
    require_auth(ram_payer);
    check(is_account(owner), "owner account does not exist");
    stats statstable(get_self(), symbol.code().raw());
    check(statstable.get(symbol.code().raw(), "symbol does not exist").supply.symbol == symbol, "symbol precision mismatch");
    accounts acnts(get_self(), owner.value);
    if(acnts.find(symbol.code().raw()) == acnts.end())
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, symbol}; });
}

void flexforex::close(const name& owner, const symbol& symbol) {
    require_auth(owner);
    accounts acnts(get_self(), owner.value);
    auto it = acnts.find(symbol.code().raw());
    check(it != acnts.end() && it->balance.amount == 0, "Cannot close (missing or non-zero balance)");
    acnts.erase(it);
}

/**
 * Transfer + tax.
 * Fees (reflection/burn/project) apply unless sender is contract (distribution) or banned.
 * Reflection fee splits into std / numbers / luck pools when setdist enabled those bps;
 * otherwise 100% lands in reflection_pool (default standard reflections).
 */
ACTION flexforex::transfer(const name& from, const name& to, const asset& quantity, const string& memo) {
    check(has_auth(from) || has_auth(get_self()), "🜚 missing required authority of sender or contract");
    check(from != to && is_account(to), "🜚 bad transfer parties");
    check(memo.size() <= 256, "✍️ memo too long ");

    auto sym = quantity.symbol.code();
    stats statstable(get_self(), sym.raw());
    const auto& st = statstable.get(sym.raw(), "🜚 no balance with specified symbol");

    accounts from_acnts(get_self(), from.value);
    const auto& from_row = from_acnts.get(sym.raw(), "🜚 sender has no balance with specified symbol");
    check(from_row.balance.amount >= quantity.amount, "🜚 sender lacks balance for transfer + flex fee. Send less.");
    check(quantity.is_valid() && quantity.amount > 0 && quantity.symbol == st.supply.symbol, "🜚 bad quantity");

    require_recipient(from);
    require_recipient(to);

    const bool is_dist = (from == get_self()); // contract paying reflections — no re-tax
    const bool from_alcor = (from == "alcor"_n || from == "swap.alcor"_n || from == "gold.mon3y"_n);
    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(sym.raw());
    const bool launched = launch_it != launches.end() && launch_it->launched;
    const bool to_alcor = (to == SWAP_ALCOR);
    if(!launched && !to_alcor && !is_dist && !from_alcor) {
        check(false, "🜚 Place a one-sided Alcor range, lock ≥ 90 days, then stamp to activate this token");
    }

    flexers flex_table(get_self(), sym.raw());
    auto flex_it = flex_table.find(from.value);
    const bool banned = flex_it != flex_table.end() && flex_it->is_banned;
    const bool seed_exempt = !launched && to_alcor;

    asset total_deduction = quantity;
    asset actual_transfer = quantity;
    auto payer = has_auth(to) ? to : from;

    if(!is_dist && !banned && !seed_exempt) {
        settings_table config(get_self(), get_self().value);
        const auto& conf = config.get(sym.raw(), "distribution config not set 🤷");

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

        // Split reflection fee across channels (or all standard if both bps are 0).
        statstable.modify(st, same_payer, [&](auto& s) {
            if(conf.numbers_bps == 0 && conf.luck_bps == 0) {
                s.reflection_pool += reflection_fee;
            } else {
                int64_t n = reflection_fee.amount * conf.numbers_bps / 10000;
                int64_t l = reflection_fee.amount * conf.luck_bps / 10000;
                s.reflection_pool.amount += reflection_fee.amount - n - l;
                s.numbers_pool.amount += n;
                s.luck_pool.amount += l;
            }
            if(!from_alcor) s.burn_pool += burn_fee;
            s.project_pool += project_fee;
        });
    }

    sub_balance(from, total_deduction);
    add_balance(to, actual_transfer, payer);
    update_flex_balance(from, -total_deduction);
    update_flex_balance(to, actual_transfer);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

ACTION flexforex::setconfig(const symbol& sym, uint64_t start_key, uint32_t limit, uint16_t reflection_rate,
                            uint16_t burn_rate, uint16_t project_rate, const name& project_account, const name& admin_account) {
    require_auth(get_self());
    stats statstable(get_self(), sym.code().raw());
    const auto& st = statstable.get(sym.code().raw(), "🜚 token with symbol does not exist");
    check(sym.is_valid() && st.supply.symbol == sym, "🜚 bad symbol");
    check(limit > 0 && limit <= 1000, "limit must be 1-1000");
    check(reflection_rate + burn_rate + project_rate <= 10000, "total fees cannot exceed 100%");
    if(project_account.value) check(is_account(project_account), "project account does not exist");
    if(admin_account.value) check(is_account(admin_account), "admin account does not exist");

    settings_table config(get_self(), get_self().value);
    auto itr = config.find(sym.code().raw());
    auto write = [&](auto& c) {
        c.token_symbol = sym;
        c.start_key = start_key;
        c.limit = limit;
        c.reflection_rate = reflection_rate;
        c.burn_rate = burn_rate;
        c.project_rate = project_rate;
        c.project_account = project_account;
        if(admin_account.value || itr == config.end())
            c.admin_account = admin_account.value ? admin_account : get_self();
    };
    if(itr == config.end()) config.emplace(get_self(), write);
    else config.modify(itr, same_payer, write);
}

/**
 * One-shot distribution features. Until this runs (or if both bps stay 0),
 * every reflection fee stays on the standard path.
 * After success, dist_locked prevents further changes to these fields.
 */
ACTION flexforex::setdist(const string& token_symbol, uint16_t numbers_bps, uint16_t luck_bps,
                          uint16_t luck_winners, int64_t luck_min_hold, uint32_t numbers_cooldown,
                          int64_t keeper_min, int64_t reflect_min) {
    check(!token_symbol.empty(), "🜚 token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    auto conf_it = config.find(code.raw());
    check(conf_it != config.end(), "distribution config not set");
    require_token_auth(st, *conf_it);
    check(!conf_it->dist_locked, "🜚 dist already locked");
    check((uint32_t)numbers_bps + luck_bps <= 10000, "🜚 numbers+luck bps exceed 100%");
    if(luck_bps) check(luck_winners > 0, "🜚 luck needs winners > 0");
    if(numbers_bps) check(numbers_cooldown > 0, "🜚 numbers needs cooldown");

    config.modify(conf_it, same_payer, [&](auto& c) {
        c.dist_locked = true;
        c.numbers_bps = numbers_bps;
        c.luck_bps = luck_bps;
        c.luck_winners = luck_winners;
        c.luck_min_hold = luck_min_hold;
        c.numbers_cooldown = numbers_cooldown;
        c.keeper_min = keeper_min;
        c.reflect_min = reflect_min;
    });
}

// ---------------------------------------------------------------------------
// Holder opts: numbers code, renounce
// ---------------------------------------------------------------------------

ACTION flexforex::setnumber(const name& owner, const string& token_symbol, uint16_t code_num) {
    require_auth(owner);
    check(code_num <= 999 && !token_symbol.empty(), "🜚 code 0-999 required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    check(config.get(code.raw(), "distribution config not set").numbers_bps > 0, "🜚 numbers not enabled");

    flexers flex_table(get_self(), code.raw());
    auto fit = ensure_flexer(flex_table, statstable, owner, st.supply.symbol, owner);
    flex_table.modify(fit, same_payer, [&](auto& f) { f.pick = code_num; });
}

ACTION flexforex::renounce(const name& account, const bool& ban_status, const string& token_symbol) {
    check(is_account(account) && !token_symbol.empty(), "🜚 bad renounce args");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    const auto& conf = config.get(code.raw(), "distribution config not set");

    // Self can only ban (opt out of reflections); admins can toggle either way.
    if(has_auth(account)) check(ban_status, "🜚 you can remove reflections, not add them back. whoops 🤷");
    else require_token_auth(st, conf);

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, statstable, account, st.supply.symbol, get_self());
    flex_table.modify(itr, same_payer, [&](auto& f) { f.is_banned = ban_status; });
}

// ---------------------------------------------------------------------------
// Numbers: draw 0-999, split pot proportional to matching holders' balances
// ---------------------------------------------------------------------------

ACTION flexforex::pullnumber(const string& token_symbol) {
    check(!token_symbol.empty(), "🜚 token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    auto st = statstable.find(code.raw());
    check(st != statstable.end(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    const auto& conf = config.get(code.raw(), "distribution config not set");
    check(conf.numbers_bps && conf.numbers_cooldown, "🜚 numbers not enabled");

    uint32_t now = now_sec();
    check(now >= st->numbers_last + conf.numbers_cooldown, "🜚 numbers cooldown");
    check(st->numbers_pool.amount > 0, "🜚 no numbers pool");

    uint16_t draw = (uint16_t)((uint32_t)(tapos_block_prefix() ^ now) % 1000);
    int64_t pot = dist_pot(st->numbers_pool.amount);
    check(pot > 0, "🜚 numbers pot empty");

    // Secondary index by pick → matching codes, then pay balance / sum(balances).
    flexers flex_table(get_self(), code.raw());
    auto bynum = flex_table.get_index<"bynumber"_n>();
    std::vector<name> winners;
    uint64_t bsum = 0;
    for(auto itr = bynum.lower_bound(draw); itr != bynum.end() && itr->pick == draw; ++itr) {
        if(itr->owner == get_self() || itr->is_banned || itr->balance.amount <= 0) continue;
        winners.push_back(itr->owner);
        bsum += (uint64_t)itr->balance.amount;
    }
    check(!winners.empty() && bsum, "🜚 no numbers match");

    int64_t remaining = pot;
    int64_t paid = 0;
    for(auto& w : winners) {
        auto fit = flex_table.find(w.value);
        if(fit == flex_table.end()) continue;
        int64_t share = mul_div(pot, weight_of(fit->balance.amount), bsum);
        if(share > remaining) share = remaining;
        if(share <= 0) continue;
        send_tokens(get_self(), w, asset{share, conf.token_symbol}, "Numbers hit 🜚");
        remaining -= share;
        paid += share;
    }
    statstable.modify(st, same_payer, [&](auto& s) {
        s.numbers_pool.amount -= paid;
        s.numbers_last = now;
    });
}

// ---------------------------------------------------------------------------
// Reflect: standard paginated splash + optional Luck winners from luck_pool
// ---------------------------------------------------------------------------

ACTION flexforex::reflect(const string& token_symbol, const name& keeper) {
    check(!token_symbol.empty(), "🜚 token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    auto st = statstable.find(code.raw());
    check(st != statstable.end(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    auto conf_it = config.find(code.raw());
    check(conf_it != config.end(), "🜚 distribution config not set");
    const auto& conf = *conf_it;

    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end() && launch_it->launched,
          "🜚 Place a one-sided Alcor range, lock ≥ 90 days, then stamp to activate this token");

    // Protocol skim once per reflect(), from stamped bps (sticky after launch).
    if(launch_it->nyra_bps || launch_it->refl_bps) {
        int64_t pool_amt = st->reflection_pool.amount;
        asset nyra_cut{(pool_amt * (int64_t)launch_it->nyra_bps) / 10000, conf.token_symbol};
        asset refl_cut{(pool_amt * (int64_t)launch_it->refl_bps) / 10000, conf.token_symbol};
        asset partner = nyra_cut + refl_cut;
        if(partner.amount > 0 && partner.amount <= pool_amt) {
            if(nyra_cut.amount > 0) {
                add_balance("nyra"_n, nyra_cut, get_self());
                update_flex_balance("nyra"_n, nyra_cut);
            }
            if(refl_cut.amount > 0) {
                add_balance("reflections"_n, refl_cut, get_self());
                update_flex_balance("reflections"_n, refl_cut);
            }
            sub_balance(get_self(), partner);
            update_flex_balance(get_self(), -partner);
            statstable.modify(st, same_payer, [&](auto& s) { s.reflection_pool -= partner; });
            st = statstable.find(code.raw());
        }
    }

    int64_t unit = (int64_t)pow(10, conf.token_symbol.precision());
    int64_t min_pool = conf.reflect_min > 0 ? conf.reflect_min : unit;
    bool do_std = st->reflection_pool.amount >= min_pool;
    bool do_luck = conf.luck_bps && conf.luck_winners && st->luck_pool.amount >= unit;
    check(do_std || do_luck, "🜚 no reflections to distribute");

    flexers flex_table(get_self(), code.raw());
    flexpools pools(get_self(), code.raw());

    // Denom = circulating supply minus DEX vaults (banned/self skipped at pay time).
    asset total_supply = get_supply(get_self(), code);
    asset alcor{0, conf.token_symbol};
    for(name a : {"alcor"_n, "gold.mon3y"_n, "swap.alcor"_n}) {
        accounts ac(get_self(), a.value);
        auto it = ac.find(code.raw());
        if(it != ac.end()) alcor += it->balance;
    }
    total_supply -= alcor;
    check(total_supply.amount > 0, "🜚 adjusted total supply must be positive");
    uint64_t denom = (uint64_t)total_supply.amount;

    auto format_memo = [&](string tpl, const name& recipient, const asset& amount) {
        auto replace = [&](const string& tok, const string& val) {
            for(size_t p = 0; (p = tpl.find(tok, p)) != string::npos; p += val.size())
                tpl.replace(p, tok.size(), val);
        };
        replace("@@", recipient.to_string());
        replace("$$", amount.to_string());
        replace("**", amount.symbol.code().to_string());
        return tpl;
    };

    asset std_paid{0, conf.token_symbol};
    asset luck_paid{0, conf.token_symbol};

    // Pay one holder (inheritance split + optional Alcor swap memo).
    auto send_one = [&](const flexer& row, asset share, asset& counter) {
        if(share.amount <= 0) return;
        name bene = row.beneficiary.value ? row.beneficiary : row.owner;
        if(!is_account(bene)) bene = row.owner;
        uint16_t br = row.bene_rate > 10000 ? 10000 : row.bene_rate;
        if(br == 0 && !row.beneficiary.value) br = 10000;
        asset tree{(share.amount * br) / 10000, conf.token_symbol};
        asset hold = share - tree;

        auto pay = [&](name recipient, asset amount, bool use_custom) {
            if(amount.amount <= 0) return;
            string memo = "Reflecting pure gold 🜚";
            name to = recipient;
            if(use_custom && !row.custom_memo.empty()) {
                memo = format_memo(row.custom_memo, recipient, amount);
            } else {
                uint64_t pid = row.flextoken ? row.flextoken : 1;
                auto pit = pools.find(pid);
                if(pit != pools.end() && !(pit->output_contract == get_self() && pit->ouput_symbol == conf.token_symbol)) {
                    memo = "swapexactin#" + pit->pool_ids + "#" + recipient.to_string() + "#" +
                           min_amount_str(pit->ouput_symbol.precision()) + " " +
                           pit->ouput_symbol.code().to_string() + "@" + pit->output_contract.to_string() + "#0#brooo";
                    to = "swap.alcor"_n;
                }
            }
            check(memo.size() <= 256, "✍️ memo has more than 256 bytes");
            send_tokens(get_self(), to, amount, memo);
            counter += amount;
        };
        pay(bene, tree, true);
        pay(row.owner, hold, false);
    };

    // Share = balance / denom × pot, clipped so page/winners cannot overdraw pot.
    auto prop_share = [&](const flexer& row, int64_t pot, int64_t& remaining, uint64_t d) -> asset {
        int64_t paid = mul_div(pot, weight_of(row.balance.amount), d);
        if(paid > remaining) paid = remaining;
        if(paid < 0) paid = 0;
        remaining -= paid;
        return asset{paid, conf.token_symbol};
    };

    // Optional tip to the crank caller (must authorize as keeper).
    if(do_std && conf.keeper_min > 0) {
        check(keeper.value, "🜚 keeper required");
        require_auth(keeper);
        int64_t tip = std::min(conf.keeper_min, dist_pot(st->reflection_pool.amount));
        if(tip > 0) {
            send_tokens(get_self(), keeper, asset{tip, conf.token_symbol}, "Keeper tip 🜚");
            statstable.modify(st, same_payer, [&](auto& s) { s.reflection_pool.amount -= tip; });
            st = statstable.find(code.raw());
        }
    }

    // --- Standard reflections (paginated) ---
    auto itr = conf.start_key == 0 ? flex_table.begin() : flex_table.lower_bound(conf.start_key);
    uint32_t processed = 0;
    if(do_std) {
        int64_t pot = dist_pot(st->reflection_pool.amount);
        int64_t remaining = pot;
        while(itr != flex_table.end() && processed < conf.limit && remaining > 0) {
            if(itr->owner != get_self() && !itr->is_banned &&
               itr->balance.symbol == conf.token_symbol && itr->balance.amount >= unit)
                send_one(*itr, prop_share(*itr, pot, remaining, denom), std_paid);
            ++itr;
            ++processed;
        }
    }

    // --- Luck: pick N random flexers, filter min_hold after pick, split luck pot by balance ---
    if(do_luck) {
        st = statstable.find(code.raw());
        int64_t pot = dist_pot(st->luck_pool.amount);
        int64_t remaining = pot;
        uint32_t now = now_sec();
        uint64_t seed = (uint64_t)(uint32_t)tapos_block_prefix() ^ ((uint64_t)now << 1) ^ code.raw();

        name winners[32];
        uint16_t nwin = conf.luck_winners > 32 ? 32 : conf.luck_winners;
        uint16_t got = 0;
        for(uint16_t i = 0; i < nwin * 2 && got < nwin; ++i) {
            seed = seed * 6364136223846793005ULL + 1;
            auto cand = flex_table.lower_bound(seed);
            if(cand == flex_table.end()) cand = flex_table.begin();
            if(cand == flex_table.end()) break;
            if(cand->owner == get_self() || cand->is_banned) continue;
            if(cand->balance.amount < conf.luck_min_hold || cand->balance.amount < unit) continue;
            bool dup = false;
            for(uint16_t j = 0; j < got; ++j) if(winners[j] == cand->owner) { dup = true; break; }
            if(!dup) winners[got++] = cand->owner;
        }

        uint64_t wsum = 0;
        for(uint16_t i = 0; i < got; ++i) {
            auto fit = flex_table.find(winners[i].value);
            wsum += fit != flex_table.end() ? weight_of(fit->balance.amount) : 1;
        }
        if(!wsum) wsum = 1;

        for(uint16_t i = 0; i < got && remaining > 0; ++i) {
            auto fit = flex_table.find(winners[i].value);
            if(fit == flex_table.end()) continue;
            send_one(*fit, prop_share(*fit, pot, remaining, wsum), luck_paid);
        }
    }

    // Drain burn/project pools once per successful splash batch.
    if(std_paid.amount || luck_paid.amount || st->burn_pool.amount || st->project_pool.amount) {
        st = statstable.find(code.raw());
        if(st->burn_pool.amount > 0)
            action(permission_level{get_self(), "active"_n}, get_self(), "burn"_n,
                   std::make_tuple(get_self(), st->burn_pool,
                       string("Burn " + std::to_string(conf.burn_rate/100) + "% of every transaction 🔥"))).send();
        if(st->project_pool.amount > 0 && conf.project_account.value)
            send_tokens(get_self(), conf.project_account, st->project_pool,
                        string("Project " + std::to_string(conf.project_rate/100.0) + "% For Team 🜚 flex.report 🜚"));

        statstable.modify(st, same_payer, [&](auto& s) {
            s.reflection_pool.amount = std::max<int64_t>(0, s.reflection_pool.amount - std_paid.amount);
            s.luck_pool.amount = std::max<int64_t>(0, s.luck_pool.amount - luck_paid.amount);
            s.burn_pool.amount = 0;
            s.project_pool.amount = 0;
        });
    }

    if(do_std)
        config.modify(conf_it, same_payer, [&](auto& c) {
            c.start_key = (itr == flex_table.end()) ? 0 : itr->owner.value;
        });
}

// ---------------------------------------------------------------------------
// Launch: register quote/range, then stamp after issuer locks on swap.alcor
// ---------------------------------------------------------------------------

ACTION flexforex::reglaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
                            int32_t tick_upper, const uint128_t& sqrt_price_x64, uint64_t proof_pool_id) {
    check(!token_symbol.empty(), "🜚 token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    require_auth(st.issuer);

    check(quote.quantity.symbol.is_valid() && quote.quantity.amount == 0, "🜚 quote must be a zero-amount extended_asset");
    check(is_account(quote.contract), "🜚 quote contract does not exist");
    check(sqrt_price_x64 > 0, "🜚 sqrt_price_x64 required (precompute off-chain)");

    int32_t spacing = spacing_for_fee(fee);
    check(spacing, "🜚 fee must be 500, 3000, or 10000");
    check(tick_lower < tick_upper, "🜚 tick_lower must be < tick_upper");
    check(tick_lower >= MIN_TICK && tick_upper <= MAX_TICK, "🜚 ticks out of Alcor range");
    check(tick_lower % spacing == 0 && tick_upper % spacing == 0, "🜚 ticks must be multiples of tickSpacing");

    const bool flex_q = is_flex_quote(quote);
    if(flex_q) check(proof_pool_id == 0, "🜚 flex quotes do not use proof_pool_id");
    else require_xtoken_tvl(quote, proof_pool_id);

    launches_table launches(get_self(), get_self().value);
    auto itr = launches.find(code.raw());
    check(itr == launches.end() || !itr->launched, "🜚 already stamped; launch params are locked");

    auto write = [&](auto& row) {
        row.token_symbol = st.supply.symbol;
        row.quote = quote;
        row.fee = fee;
        row.tick_lower = tick_lower;
        row.tick_upper = tick_upper;
        row.sqrt_price_x64 = sqrt_price_x64;
        row.proof_pool_id = proof_pool_id;
        row.flex_quote = flex_q;
        row.launched = false;
        row.pool_id = 0;
        row.pos_id = 0;
        row.nyra_bps = 0;
        row.refl_bps = 0;
    };
    if(itr == launches.end()) launches.emplace(st.issuer, write);
    else launches.modify(itr, same_payer, write);
}

ACTION flexforex::stamp(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper) {
    check(!token_symbol.empty(), "🜚 token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    require_auth(st.issuer);

    launches_table launches(get_self(), get_self().value);
    auto launch_it = launches.find(code.raw());
    check(launch_it != launches.end(), "🜚 reglaunch first");
    check(!launch_it->launched, "🜚 already stamped");
    check(tick_lower == launch_it->tick_lower && tick_upper == launch_it->tick_upper, "🜚 ticks must match reglaunch");

    auto pool = alcor::get_pool(SWAP_ALCOR, pool_id);
    check(pool.active, "🜚 pool is not active — pay activeFee with memo activepool#id");
    check(pool.fee == launch_it->fee, "🜚 pool fee does not match reglaunch");

    const symbol launched_sym = st.supply.symbol;
    const bool a_is_ours = same_ext(pool.tokenA, get_self(), launched_sym);
    const bool b_is_ours = same_ext(pool.tokenB, get_self(), launched_sym);
    check(a_is_ours != b_is_ours, "🜚 pool must pair this flex token with the registered quote");
    const auto& quote_side = a_is_ours ? pool.tokenB : pool.tokenA;
    check(quote_side.contract == launch_it->quote.contract &&
              quote_side.quantity.symbol == launch_it->quote.quantity.symbol,
          "🜚 pool quote does not match reglaunch");

    int32_t tick = pool.currSlot.tick;
    if(a_is_ours)
        check(tick < tick_lower, "🜚 one-sided launch: current tick must sit below the range (all tokenA)");
    else
        check(tick >= tick_upper, "🜚 one-sided launch: current tick must sit at or above the range (all tokenB)");

    auto pos = alcor::get_position(SWAP_ALCOR, pool_id, st.issuer, tick_lower, tick_upper);
    check(pos.liquidity > 0, "🜚 issuer position has no liquidity");

    uint32_t unlock = alcor::get_unlock_time(SWAP_ALCOR, pos.id);
    check(unlock >= now_sec() + MIN_LOCK_SECS,
          "🜚 Place a one-sided Alcor range and lock ≥ 90 days, then stamp to activate this token");

    asset supply = get_supply(get_self(), code);
    check(supply.amount > 0, "🜚 mint 100% of supply before stamp");
    accounts alcor_ac(get_self(), SWAP_ALCOR.value);
    auto alcor_it = alcor_ac.find(code.raw());
    check(alcor_it != alcor_ac.end() && alcor_it->balance.amount == supply.amount,
          "🜚 100% of supply must sit on swap.alcor");
    check(alcor::get_unused_balance(SWAP_ALCOR, st.issuer, get_self(), launched_sym) == 0,
          "🜚 unused Alcor balance must be 0 — put 100% into the position");

    const uint16_t bps = launch_it->flex_quote ? 0 : PROTO_BPS_HALF;
    launches.modify(launch_it, same_payer, [&](auto& row) {
        row.launched = true;
        row.pool_id = pool_id;
        row.pos_id = pos.id;
        row.nyra_bps = bps;
        row.refl_bps = bps;
    });
}

// ---------------------------------------------------------------------------
// Alcor pool routing + inheritance
// ---------------------------------------------------------------------------

ACTION flexforex::addpool(const uint64_t& id, const string& token_symbol, const symbol& pool_symbol,
                          const name& output_contract, const string& pool_ids) {
    check(!token_symbol.empty() && !pool_ids.empty() && pool_symbol.is_valid(), "🜚 bad pool args");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    const auto& conf = config.get(code.raw(), "distribution config not set");
    require_token_auth(st, conf);
    check(is_account(output_contract), "token contract account does not exist 🤷");

    flexpools pools(get_self(), st.supply.symbol.code().raw());
    auto itr = pools.find(id);
    auto write = [&](auto& p) {
        p.id = id; p.input_symbol = st.supply.symbol; p.ouput_symbol = pool_symbol;
        p.output_contract = output_contract; p.pool_ids = pool_ids;
    };
    if(itr == pools.end()) pools.emplace(get_self(), write);
    else pools.modify(itr, same_payer, write);
}

ACTION flexforex::interestoken(const name& owner, const string& token_symbol, const string& pool_symbol) {
    check(!token_symbol.empty(), "🜚 token symbol is required");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    settings_table config(get_self(), get_self().value);
    const auto& conf = config.get(code.raw(), "distribution config not set");
    require_token_auth(st, conf, owner);

    flexers flex_table(get_self(), code.raw());
    auto flex_it = flex_table.find(owner.value);

    // Empty / "flexforex" → native reflections (no Alcor swap).
    if(pool_symbol.empty() || pool_symbol == "flexforex") {
        if(flex_it != flex_table.end())
            flex_table.modify(flex_it, same_payer, [&](auto& f) { f.flextoken = 0; });
        return;
    }

    flexpools pools(get_self(), st.supply.symbol.code().raw());
    uint64_t matching_id = 0;
    for(auto pit = pools.begin(); pit != pools.end(); ++pit)
        if(pit->ouput_symbol.code().to_string() == pool_symbol) { matching_id = pit->id; break; }
    check(matching_id, "🜚 No reflection pool found for symbol: " + pool_symbol);

    auto itr = ensure_flexer(flex_table, statstable, owner, st.supply.symbol, get_self());
    flex_table.modify(itr, same_payer, [&](auto& f) { f.flextoken = matching_id; });
}

ACTION flexforex::inheritance(const name& flexer, const name& beneficiary, const uint16_t& rate, const string& token_symbol) {
    check(has_auth(flexer) || has_auth(get_self()), "🜚 missing authority");
    check(rate <= 10000 && !token_symbol.empty(), "🜚 bad inheritance args");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");
    name bene = beneficiary.value ? beneficiary : flexer;
    check(is_account(bene), "🜚 beneficiary account does not exist");

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, statstable, flexer, st.supply.symbol,
                             has_auth(get_self()) ? get_self() : flexer);
    flex_table.modify(itr, same_payer, [&](auto& f) { f.beneficiary = bene; f.bene_rate = rate; });
}

ACTION flexforex::inheritmemo(const name& flexer, const string& custom_memo, const string& token_symbol) {
    check(has_auth(flexer) || has_auth(get_self()), "🜚 missing authority");
    check(custom_memo.size() <= 200 && !token_symbol.empty(), "🜚 bad inheritmemo args");
    symbol_code code(token_symbol);
    stats statstable(get_self(), code.raw());
    const auto& st = statstable.get(code.raw(), "🜚 token with symbol does not exist");

    flexers flex_table(get_self(), code.raw());
    auto itr = ensure_flexer(flex_table, statstable, flexer, st.supply.symbol,
                             has_auth(get_self()) ? get_self() : flexer);
    flex_table.modify(itr, same_payer, [&](auto& f) { f.custom_memo = custom_memo; });
}

// Forward Alcor LP fee memos tagged "Col..." into reflections account.
[[eosio::on_notify("*::transfer")]]
void flexforex::handle_transfer(name from, name to, asset quantity, string memo) {
    if(to != get_self() || from != "swap.alcor"_n) return;
    if(memo.size() < 3 || memo.substr(0, 3) != "Col") return;
    action(permission_level{get_self(), "active"_n}, get_first_receiver(), "transfer"_n,
           std::make_tuple(get_self(), "reflections"_n, quantity, string("🜚 LP Fees 🙏"))).send();
}

} /// namespace eosio
