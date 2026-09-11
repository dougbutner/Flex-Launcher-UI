#pragma once

#include <eosio/asset.hpp>
#include <eosio/crypto.hpp>
#include <eosio/eosio.hpp>
#include <eosio/time.hpp>
#include <optional>

namespace eosio {

   using std::string;

    /**
    * flexforex — create reflection tokens with optional Numbers / Jackpot channels.
    *
    * Create path: create (issuer) + mint 100% → startlaunch → issuer seeds swap.alcor
    * (createpool, deposit, one-sided addliquid, lockpos ≥90d) → liftoff.
    * Until liftoff, the only legal `to` is swap.alcor (seed/lock). swap.alcor cannot send out.
    * After liftoff, standard reflections apply; protocol skim bps start at liftoff and may rise once if the
    * launch LP unlocks (`checklock` / `makeitrain` after `unlock_time`).
    * Transfer tax splits on receipt: reflection_rate is cut by angel_numbers_bps / jackpot_bps
    * into angel_numbers_pool and jackpot_pool; remainder is reflection_pool. makeitrain
    * splashes only reflection_pool. pullangel / pulljackpot pay their own columns.
    * Issuer may call setfees and ratios on their token; setconfig stays contract-only.
    */
   class [[eosio::contract("flexforex")]] flexforex : public contract {
      public:
         using contract::contract;

         ACTION create(const name& issuer, const asset& maximum_supply);
         ACTION mint(const name& to, const asset& quantity, const string& memo);
         ACTION burn(const name& username, const asset& quantity, const string& memo);
         ACTION transfer(const name& from, const name& to, const asset& quantity, const string& memo);
         ACTION open(const name& owner, const symbol& symbol, const name& ram_payer);
         ACTION close(const name& owner, const symbol& symbol);
         ACTION makeitrain(const string& token_symbol, const name& keeper);
         ACTION setconfig(const symbol& sym, const std::optional<uint64_t>& start_key, const std::optional<uint32_t>& limit,
                          const std::optional<uint16_t>& reflection_rate, const std::optional<uint16_t>& burn_rate,
                          const std::optional<uint16_t>& project_rate, const std::optional<name>& project_account,
                          const std::optional<name>& admin_account);
         ACTION setfees(const symbol& sym, uint16_t reflection_rate, uint16_t burn_rate, uint16_t project_rate,
                        const name& project_account);
         // Issuer or contract: angel/jackpot share of reflection_rate on transfer.
         ACTION ratios(const string& token_symbol, uint16_t angel_numbers_bps, uint16_t jackpot_bps);
         // One-shot (issuer) or anytime (contract): Numbers/Jackpot ops + initial ratios. Locks dist_locked for issuer.
         ACTION setdist(const string& token_symbol, uint16_t angel_numbers_bps, uint16_t jackpot_bps,
                        uint16_t jackpot_winners, int64_t jackpot_min_hold, uint32_t angel_numbers_cooldown,
                        int64_t keeper_min, int64_t reflect_min);
         ACTION setangelnum(const name& owner, const string& token_symbol, uint16_t angel_number);
         ACTION pullangel(const string& token_symbol);
         ACTION pulljackpot(const string& token_symbol);
         // Called only by XPR `rng` after requestrand. assoc_id = token symbol code.
         ACTION receiverand(uint64_t assoc_id, const checksum256& random_value);
         ACTION feeoptout(const name& account, const bool& ban_status, const string& token_symbol);
         ACTION addpool(const uint64_t& pool_id, const string& token_symbol, const symbol& output_symbol,
                        const name& output_contract);
         ACTION choosereward(const name& owner, const string& token_symbol, const symbol& output_symbol,
                             const name& output_contract);
         ACTION inheritance(const name& flexer, const name& beneficiary, const uint16_t& rate, const string& token_symbol);
         ACTION inheritmemo(const name& flexer, const string& custom_memo, const string& token_symbol);
         // Record quote + range before paying Alcor RAM. Does not create the pool.
         ACTION startlaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
                          int32_t tick_upper, const uint128_t& sqrt_price_x64, uint64_t xtoken_proof_pool_id,
                          bool swap_underlying_default);
         // One-shot: verify issuer-owned one-sided 100% lock ≥90d on swap.alcor, then unlock transfers.
         ACTION liftoff(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper);
         ACTION checklock(const string& token_symbol);

         static asset get_supply(const name& token_contract_account, const symbol_code& sym_code) {
            stats statstable(token_contract_account, sym_code.raw());
            return statstable.get(sym_code.raw(), "invalid supply symbol code 🤷").supply;
         }

         static asset get_balance(const name& token_contract_account, const name& owner, const symbol_code& sym_code) {
            accounts accountstable(token_contract_account, owner.value);
            return accountstable.get(sym_code.raw(), "no balance with specified symbol 🤷").balance;
         }

         using create_action = eosio::action_wrapper<"create"_n, &flexforex::create>;
         using mint_action = eosio::action_wrapper<"mint"_n, &flexforex::mint>;
         using burn_action = eosio::action_wrapper<"burn"_n, &flexforex::burn>;
         using transfer_action = eosio::action_wrapper<"transfer"_n, &flexforex::transfer>;
         using open_action = eosio::action_wrapper<"open"_n, &flexforex::open>;
         using close_action = eosio::action_wrapper<"close"_n, &flexforex::close>;
         using makeitrain_action = eosio::action_wrapper<"makeitrain"_n, &flexforex::makeitrain>;
         using setconfig_action = eosio::action_wrapper<"setconfig"_n, &flexforex::setconfig>;
         using setfees_action = eosio::action_wrapper<"setfees"_n, &flexforex::setfees>;
         using ratios_action = eosio::action_wrapper<"ratios"_n, &flexforex::ratios>;
         using setdist_action = eosio::action_wrapper<"setdist"_n, &flexforex::setdist>;
         using setangelnum_action = eosio::action_wrapper<"setangelnum"_n, &flexforex::setangelnum>;
         using pullangel_action = eosio::action_wrapper<"pullangel"_n, &flexforex::pullangel>;
         using pulljackpot_action = eosio::action_wrapper<"pulljackpot"_n, &flexforex::pulljackpot>;
         using receiverand_action = eosio::action_wrapper<"receiverand"_n, &flexforex::receiverand>;
         using feeoptout_action = eosio::action_wrapper<"feeoptout"_n, &flexforex::feeoptout>;
         using addpool_action = eosio::action_wrapper<"addpool"_n, &flexforex::addpool>;
         using choosereward_action = eosio::action_wrapper<"choosereward"_n, &flexforex::choosereward>;
         using inheritance_action = eosio::action_wrapper<"inheritance"_n, &flexforex::inheritance>;
         using inheritmemo_action = eosio::action_wrapper<"inheritmemo"_n, &flexforex::inheritmemo>;
         using startlaunch_action = eosio::action_wrapper<"startlaunch"_n, &flexforex::startlaunch>;
         using liftoff_action = eosio::action_wrapper<"liftoff"_n, &flexforex::liftoff>;
         using checklock_action = eosio::action_wrapper<"checklock"_n, &flexforex::checklock>;

         static constexpr name SWAP_ALCOR = "swap.alcor"_n;
         static constexpr name XTOKENS = "xtokens"_n;
         static constexpr name MON3Y = "mon3y"_n;
         // XPR mainnet launch accounts: easyflex@3asy, complexflex@fl3x, flexforex@flex
         static constexpr name XPR_EASYFLEX = "3asy"_n;
         static constexpr name XPR_COMPLEXFLEX = "fl3x"_n;
         static constexpr name XPR_FLEXFOREX = "flex"_n;
         static constexpr int64_t LAUNCH_EASY_MIN = 50000000000; // 50000.000000 EASY per already-launched token + 1
         static constexpr name RNG = "rng"_n;
         static constexpr uint8_t RNG_NUMBERS = 1;
         static constexpr uint8_t RNG_JACKPOT = 2;
         static constexpr uint32_t MIN_LOCK_SECS = 90 * 24 * 60 * 60; // 90 days
         static constexpr int32_t MIN_TICK = -443636;
         static constexpr int32_t MAX_TICK = 443636;
         static constexpr uint16_t PROTO_BPS_HALF = 25;  // 0.25% each; +0.25% each if LP unlocked
         static constexpr uint32_t PAY_NUM = 382;
         static constexpr uint32_t PAY_DEN = 1000;

      private:
         // Per-account token balance (standard token pattern).
         TABLE account {
            asset    balance;
            uint64_t primary_key()const { return balance.symbol.code().raw(); }
         };

         // Per-symbol supply + fee pools. Scope = symbol code.
         TABLE currency_stats {
            asset    supply;
            asset    max_supply;
            name     issuer;
            asset    reflection_pool;     // standard splash only
            asset    burn_pool;
            asset    project_pool;
            asset    angel_numbers_pool;  // pullangel pot
            asset    jackpot_pool;        // pulljackpot pot
            uint32_t angel_numbers_last = 0; // last pullangel unix time
            uint32_t flexer_count = 0;
            uint64_t primary_key()const { return supply.symbol.code().raw(); }
         };

         // Reflection participant row. Scope = token symbol code.
         TABLE flexer {
            name     owner;
            asset    balance;           // mirrored from accounts for fast walks
            bool     fee_opted_out = false;
            uint64_t flex_reward_pool_id = 0;     // 0 = native or token swap_underlying_default; else flexpools id
            name     beneficiary;
            uint16_t bene_rate = 10000; // inheritance split (bps of share)
            string   custom_memo;
            uint16_t angel_number = 1000;       // angel number; 1000 = unset
            uint64_t primary_key()const { return owner.value; }
            uint64_t by_angel()const { return angel_number; }
         };

         // Per-token config. Scope = symbol code.
         TABLE settings {
            symbol    token_symbol;
            uint64_t  start_key = 0;       // reflect pagination cursor
            uint32_t  limit = 100;         // holders per reflect call
            uint16_t  reflection_rate = 100;
            uint16_t  burn_rate = 0;
            uint16_t  project_rate = 100;
            name      project_account;
            name      admin_account;
            bool      dist_locked = false; // setdist may run only once
            uint16_t  angel_numbers_bps = 0;  // share of reflection_rate on transfer
            uint16_t  jackpot_bps = 0;        // share of reflection_rate on transfer; rest = standard
            uint16_t  jackpot_winners = 0;
            int64_t   jackpot_min_hold = 0;   // checked AFTER random draw
            uint32_t  angel_numbers_cooldown = 0;
            int64_t   keeper_min = 0;      // tip for calling reflect
            int64_t   reflect_min = 0;     // threshold vault on standard pool
            uint8_t   rng_kind = 0;        // 0 idle, 1 angel numbers, 2 jackpot — pending rng callback
            int64_t   rng_amt = 0;         // reserved from angel_numbers_pool or jackpot_pool until receiverand
            uint64_t primary_key()const { return token_symbol.code().raw(); }
         };

         // Alcor output pools holders can flex reflections into.
         // Scope = token symbol code. PK = Alcor pool id. One row per (input, output contract+symbol).
         TABLE flexpool {
            uint64_t id;               // Alcor pool id (fee-tier upsert may replace this)
            symbol   input_symbol;     // which issued coin on this contract
            name     input_contract;   // get_self()
            symbol   output_symbol;    // flex-to token
            name     output_contract;
            uint64_t primary_key()const { return id; }
         };

         typedef eosio::multi_index<"flexpools"_n, flexpool> flexpools;

         // Per-token Alcor launch. Scope = contract. Separate from settings so old rows stay ABI-safe.
         TABLE launch {
            symbol          token_symbol;
            extended_asset  quote;
            uint32_t        fee = 0;
            int32_t         tick_lower = 0;
            int32_t         tick_upper = 0;
            uint128_t       sqrt_price_x64 = 0;
            uint64_t        xtoken_proof_pool_id = 0;
            bool            flex_quote = false;
            bool            launched = false;
            uint64_t        pure_liquid_alcor_pool_id = 0;
            uint64_t        position_id = 0;
            uint16_t        dev_bps = 0;
            uint16_t        club_bps = 0;
            uint32_t        unlock_time = 0;  // Alcor lock expiry copied at liftoff
            bool            swap_underlying_default = false;  // pid 0 → swap into launch quote pool
            uint64_t primary_key()const { return token_symbol.code().raw(); }
         };

         using settings_table = eosio::multi_index<"settings"_n, settings>;
         using launches_table = eosio::multi_index<"launches"_n, launch>;
         using accounts = eosio::multi_index<"accounts"_n, account>;
         using stats = eosio::multi_index<"stat"_n, currency_stats>;
         using flexers = eosio::multi_index<"flexers"_n, flexer,
            indexed_by<"byangel"_n, const_mem_fun<flexer, uint64_t, &flexer::by_angel>>
         >;

         void sub_balance(const name& owner, const asset& value);
         void add_balance(const name& owner, const asset& value, const name& ram_payer);
         void update_flex_balance(const name& owner, const asset& value, const name& ram_payer);
         // Create flexer if missing; bumps flexer_count. Returns iterator.
         flexers::const_iterator ensure_flexer(flexers& table, stats& statstable, const name& owner,
                                               const symbol& sym, const name& ram_payer);
         void open_holder_ram(const name& owner, const symbol& sym, const name& ram_payer);
         void drop_flexer_if_empty(const name& owner, const symbol& sym);
         void require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user = name());
         void maybe_apply_unlock_fee(launches_table& launches, launches_table::const_iterator launch_it, bool force_alcor);
         void request_rng(uint64_t assoc_id, uint8_t kind, int64_t amt);
   };
}
