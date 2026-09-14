#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/time.hpp>
#include <optional>

namespace eosio {

   using std::string;

   /**
    * complexflex — grams-style reflections, anyone can create.
    *
    * Until liftoff, the only legal `to` is swap.alcor (seed/lock). swap.alcor cannot send out.
    * Same 90-day one-sided Alcor lock and nyra/reflections bps on xtoken quotes as flexforex.
    * No Numbers / Jackpot / RNG.
    */
   class [[eosio::contract("complexflex")]] complexflex : public contract {
      public:
         using contract::contract;

         ACTION create(const name& issuer, const asset& maximum_supply);
         ACTION mint(const name& to, const asset& quantity, const string& memo);
         ACTION burn(const name& username, const asset& quantity, const string& memo);
         ACTION transfer(const name& from, const name& to, const asset& quantity, const string& memo);
         ACTION open(const name& owner, const symbol& symbol, const name& ram_payer);
         ACTION close(const name& owner, const symbol& symbol);
         ACTION makeitrain(const string& token_symbol, const name& sender,
                          const std::optional<int64_t>& min_hold = {},
                          const std::optional<int64_t>& min_pool = {});
         ACTION setconfig(const symbol& sym, const std::optional<uint64_t>& start_key, const std::optional<uint32_t>& limit,
                          const std::optional<uint16_t>& reflection_rate, const std::optional<uint16_t>& burn_rate,
                          const std::optional<uint16_t>& project_rate, const std::optional<name>& project_account,
                          const std::optional<name>& admin_account);
         ACTION setfees(const symbol& sym, uint16_t reflection_rate, uint16_t burn_rate, uint16_t project_rate,
                        const name& project_account);
         ACTION setmin(const string& token_symbol, int64_t reflect_min);
         ACTION feeoptout(const name& account, const bool& ban_status, const string& token_symbol);
         ACTION addpool(const uint64_t& pool_id, const string& token_symbol, const symbol& output_symbol,
                        const name& output_contract);
         ACTION choosereward(const name& owner, const string& token_symbol, const symbol& output_symbol,
                             const name& output_contract);
         ACTION inheritance(const name& flexer, const name& beneficiary, const uint16_t& rate, const string& token_symbol);
         ACTION inheritmemo(const name& flexer, const string& custom_memo, const string& token_symbol);
         ACTION startlaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
                          int32_t tick_upper, const uint128_t& sqrt_price_x64, uint64_t xtoken_proof_pool_id,
                          bool swap_underlying_default);
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

         using create_action = eosio::action_wrapper<"create"_n, &complexflex::create>;
         using mint_action = eosio::action_wrapper<"mint"_n, &complexflex::mint>;
         using burn_action = eosio::action_wrapper<"burn"_n, &complexflex::burn>;
         using transfer_action = eosio::action_wrapper<"transfer"_n, &complexflex::transfer>;
         using open_action = eosio::action_wrapper<"open"_n, &complexflex::open>;
         using close_action = eosio::action_wrapper<"close"_n, &complexflex::close>;
         using makeitrain_action = eosio::action_wrapper<"makeitrain"_n, &complexflex::makeitrain>;
         using setconfig_action = eosio::action_wrapper<"setconfig"_n, &complexflex::setconfig>;
         using setfees_action = eosio::action_wrapper<"setfees"_n, &complexflex::setfees>;
         using setmin_action = eosio::action_wrapper<"setmin"_n, &complexflex::setmin>;
         using feeoptout_action = eosio::action_wrapper<"feeoptout"_n, &complexflex::feeoptout>;
         using addpool_action = eosio::action_wrapper<"addpool"_n, &complexflex::addpool>;
         using choosereward_action = eosio::action_wrapper<"choosereward"_n, &complexflex::choosereward>;
         using inheritance_action = eosio::action_wrapper<"inheritance"_n, &complexflex::inheritance>;
         using inheritmemo_action = eosio::action_wrapper<"inheritmemo"_n, &complexflex::inheritmemo>;
         using startlaunch_action = eosio::action_wrapper<"startlaunch"_n, &complexflex::startlaunch>;
         using liftoff_action = eosio::action_wrapper<"liftoff"_n, &complexflex::liftoff>;
         using checklock_action = eosio::action_wrapper<"checklock"_n, &complexflex::checklock>;

         static constexpr name SWAP_ALCOR = "swap.alcor"_n;
         static constexpr name XTOKENS = "xtokens"_n;
         static constexpr name MON3Y = "mon3y"_n;
         // XPR mainnet launch accounts: easyflex@3asy, complexflex@fl3x, flexforex@flex
         static constexpr name XPR_EASYFLEX = "3asy"_n;
         static constexpr name XPR_COMPLEXFLEX = "fl3x"_n;
         static constexpr name XPR_FLEXFOREX = "flex"_n;
         static constexpr int64_t LAUNCH_EASY_MIN = 10000000000; // 10000.000000 EASY per already-launched token + 1
         static constexpr uint32_t MIN_LOCK_SECS = 90 * 24 * 60 * 60;
         static constexpr int32_t MIN_TICK = -443636;
         static constexpr int32_t MAX_TICK = 443636;
         static constexpr uint16_t PROTO_BPS_HALF = 25;  // 0.25% each; +0.25% each if LP unlocked
         static constexpr uint32_t PAY_NUM = 382;
         static constexpr uint32_t PAY_DEN = 1000;

      private:
         TABLE account {
            asset    balance;
            uint64_t primary_key()const { return balance.symbol.code().raw(); }
         };

         TABLE currency_stats {
            asset    supply;
            asset    max_supply;
            name     issuer;
            asset    reflection_pool;
            asset    burn_pool;
            asset    project_pool;
            uint64_t primary_key()const { return supply.symbol.code().raw(); }
         };

         TABLE flexer {
            name     owner;
            asset    balance;
            bool     fee_opted_out = false;
            uint64_t flex_reward_pool_id = 0;     // 0 = native or token swap_underlying_default; else flexpools id
            name     beneficiary;
            uint16_t bene_rate = 10000;
            string   custom_memo;
            uint64_t primary_key()const { return owner.value; }
         };

         // Per-token config. Scope = symbol code.
         TABLE settings {
            symbol    token_symbol;
            uint64_t  start_key = 0;
            uint32_t  limit = 100;
            uint16_t  reflection_rate = 100;
            uint16_t  burn_rate = 0;
            uint16_t  project_rate = 100;
            name      project_account;
            name      admin_account;
            int64_t   reflect_min = 0;  // std_pay floor; 0 = 1 whole token
            uint64_t primary_key()const { return token_symbol.code().raw(); }
         };

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
         using flexers = eosio::multi_index<"flexers"_n, flexer>;

         void sub_balance(const name& owner, const asset& value);
         void add_balance(const name& owner, const asset& value, const name& ram_payer);
         void update_flex_balance(const name& owner, const asset& value, const name& ram_payer);
         flexers::const_iterator ensure_flexer(flexers& table, const name& owner, const symbol& sym, const name& ram_payer);
         void open_holder_ram(const name& owner, const symbol& sym, const name& ram_payer);
         void drop_flexer_if_empty(const name& owner, const symbol& sym);
         void require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user = name());
         void maybe_apply_unlock_fee(launches_table& launches, launches_table::const_iterator launch_it, bool force_alcor);
   };
}
