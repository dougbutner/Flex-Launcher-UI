#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/time.hpp>

namespace eosio {

   using std::string;

    /**
    * flexforex — forge reflection tokens with optional Numbers / Luck channels.
    *
    * Create path: forge (issuer) + mint 100% → reglaunch → issuer seeds swap.alcor
    * (createpool, deposit, one-sided addliquid, lockpos ≥90d) → stamp.
    * Until stamp, transfers may only go to swap.alcor. After stamp, standard
    * reflections apply; protocol skim bps are sticky on the launches table.
    * Later one-shot setdist can split reflection fees into Numbers + Luck pools.
    */
   class [[eosio::contract("flexforex")]] flexforex : public contract {
      public:
         using contract::contract;

         // Each splash only pays this share of a pool; rest is a safety buffer (golden-ratio style).
         static constexpr uint16_t DIST_BPS = 6180; // 61.8%

         ACTION forge(const name& issuer, const asset& maximum_supply);
         ACTION mint(const name& to, const asset& quantity, const string& memo);
         ACTION burn(const name& username, const asset& quantity, const string& memo);
         ACTION transfer(const name& from, const name& to, const asset& quantity, const string& memo);
         ACTION open(const name& owner, const symbol& symbol, const name& ram_payer);
         ACTION close(const name& owner, const symbol& symbol);
         ACTION reflect(const string& token_symbol, const name& keeper);
         ACTION setconfig(const symbol& sym, uint64_t start_key, uint32_t limit, uint16_t reflection_rate,
                          uint16_t burn_rate, uint16_t project_rate, const name& project_account, const name& admin_account);
         // One-shot: Numbers/Luck bps + keeper/threshold. Locks dist_locked=true.
         ACTION setdist(const string& token_symbol, uint16_t numbers_bps, uint16_t luck_bps,
                        uint16_t luck_winners, int64_t luck_min_hold, uint32_t numbers_cooldown,
                        int64_t keeper_min, int64_t reflect_min);
         ACTION setnumber(const name& owner, const string& token_symbol, uint16_t code);
         ACTION pullnumber(const string& token_symbol);
         ACTION renounce(const name& account, const bool& ban_status, const string& token_symbol);
         ACTION addpool(const uint64_t& id, const string& token_symbol, const symbol& pool_symbol,
                        const name& output_contract, const string& pool_ids);
         ACTION interestoken(const name& owner, const string& token_symbol, const string& pool_symbol);
         ACTION inheritance(const name& flexer, const name& beneficiary, const uint16_t& rate, const string& token_symbol);
         ACTION inheritmemo(const name& flexer, const string& custom_memo, const string& token_symbol);
         // Record quote + range before paying Alcor RAM. Does not create the pool.
         ACTION reglaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
                          int32_t tick_upper, const uint128_t& sqrt_price_x64, uint64_t proof_pool_id);
         // One-shot: verify issuer-owned one-sided 100% lock ≥90d on swap.alcor, then unlock transfers.
         ACTION stamp(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper);

         [[eosio::on_notify("*::transfer")]]
         void handle_transfer(name from, name to, asset quantity, string memo);

         static asset get_supply(const name& token_contract_account, const symbol_code& sym_code) {
            stats statstable(token_contract_account, sym_code.raw());
            return statstable.get(sym_code.raw(), "invalid supply symbol code 🤷").supply;
         }

         static asset get_balance(const name& token_contract_account, const name& owner, const symbol_code& sym_code) {
            accounts accountstable(token_contract_account, owner.value);
            return accountstable.get(sym_code.raw(), "no balance with specified symbol 🤷").balance;
         }

         using forge_action = eosio::action_wrapper<"forge"_n, &flexforex::forge>;
         using mint_action = eosio::action_wrapper<"mint"_n, &flexforex::mint>;
         using burn_action = eosio::action_wrapper<"burn"_n, &flexforex::burn>;
         using transfer_action = eosio::action_wrapper<"transfer"_n, &flexforex::transfer>;
         using open_action = eosio::action_wrapper<"open"_n, &flexforex::open>;
         using close_action = eosio::action_wrapper<"close"_n, &flexforex::close>;
         using reflect_action = eosio::action_wrapper<"reflect"_n, &flexforex::reflect>;
         using setconfig_action = eosio::action_wrapper<"setconfig"_n, &flexforex::setconfig>;
         using setdist_action = eosio::action_wrapper<"setdist"_n, &flexforex::setdist>;
         using setnumber_action = eosio::action_wrapper<"setnumber"_n, &flexforex::setnumber>;
         using pullnumber_action = eosio::action_wrapper<"pullnumber"_n, &flexforex::pullnumber>;
         using renounce_action = eosio::action_wrapper<"renounce"_n, &flexforex::renounce>;
         using addpool_action = eosio::action_wrapper<"addpool"_n, &flexforex::addpool>;
         using interestoken_action = eosio::action_wrapper<"interestoken"_n, &flexforex::interestoken>;
         using inheritance_action = eosio::action_wrapper<"inheritance"_n, &flexforex::inheritance>;
         using inheritmemo_action = eosio::action_wrapper<"inheritmemo"_n, &flexforex::inheritmemo>;
         using reglaunch_action = eosio::action_wrapper<"reglaunch"_n, &flexforex::reglaunch>;
         using stamp_action = eosio::action_wrapper<"stamp"_n, &flexforex::stamp>;

         static constexpr name SWAP_ALCOR = "swap.alcor"_n;
         static constexpr name XTOKENS = "xtokens"_n;
         static constexpr uint32_t MIN_LOCK_SECS = 90 * 24 * 60 * 60; // 90 days
         static constexpr int32_t MIN_TICK = -443636;
         static constexpr int32_t MAX_TICK = 443636;
         static constexpr uint16_t PROTO_BPS_HALF = 25;  // 0.25% each to nyra + reflections on xtoken launches

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
            asset    reflection_pool; // standard holder splash
            asset    burn_pool;
            asset    project_pool;
            asset    numbers_pool;    // filled when numbers_bps > 0
            asset    luck_pool;       // filled when luck_bps > 0
            uint32_t numbers_last = 0; // last pullnumber unix time
            uint32_t flexer_count = 0;
            uint64_t primary_key()const { return supply.symbol.code().raw(); }
         };

         // Reflection participant row. Scope = token symbol code.
         TABLE flexer {
            name     owner;
            asset    balance;          // mirrored from accounts for fast walks
            bool     is_banned = false;
            uint64_t flextoken = 0;     // Alcor pool id for auto-swap reflections
            name     beneficiary;
            uint16_t bene_rate = 10000; // inheritance split (bps of share)
            string   custom_memo;
            uint16_t pick = 1000;      // numbers code; 1000 = unset
            uint64_t primary_key()const { return owner.value; }
            uint64_t by_number()const { return pick; }
         };

         // Per-token config. Scope = contract.
         TABLE settings {
            symbol    token_symbol;
            uint64_t  start_key = 0;     // reflect pagination cursor
            uint32_t  limit = 100;       // holders per reflect call
            uint16_t  reflection_rate = 100;
            uint16_t  burn_rate = 0;
            uint16_t  project_rate = 100;
            name      project_account;
            name      admin_account;
            bool      dist_locked = false; // setdist may run only once
            uint16_t  numbers_bps = 0;     // share of reflection fee → numbers_pool
            uint16_t  luck_bps = 0;        // share of reflection fee → luck_pool
            uint16_t  luck_winners = 0;
            int64_t   luck_min_hold = 0;   // checked AFTER random pick
            uint32_t  numbers_cooldown = 0;
            int64_t   keeper_min = 0;      // tip for calling reflect
            int64_t   reflect_min = 0;     // threshold vault on standard pool
            uint64_t primary_key()const { return token_symbol.code().raw(); }
         };

         // Alcor output pools holders can route reflections into.
         TABLE flexpool {
            uint64_t id;
            symbol   input_symbol;
            symbol   ouput_symbol;
            name     output_contract;
            string   pool_ids;
            uint64_t primary_key()const { return id; }
            uint64_t by_symbol()const { return ouput_symbol.raw(); }
         };

         typedef eosio::multi_index<"flexpools"_n, flexpool,
            indexed_by<"bysymbol"_n, const_mem_fun<flexpool, uint64_t, &flexpool::by_symbol>>
         > flexpools;

         // Per-token Alcor launch. Scope = contract. Separate from settings so old rows stay ABI-safe.
         TABLE launch {
            symbol          token_symbol;
            extended_asset  quote;
            uint32_t        fee = 0;
            int32_t         tick_lower = 0;
            int32_t         tick_upper = 0;
            uint128_t       sqrt_price_x64 = 0;
            uint64_t        proof_pool_id = 0;
            bool            flex_quote = false;
            bool            launched = false;
            uint64_t        pool_id = 0;
            uint64_t        pos_id = 0;
            uint16_t        nyra_bps = 0;
            uint16_t        refl_bps = 0;
            uint64_t primary_key()const { return token_symbol.code().raw(); }
         };

         using settings_table = eosio::multi_index<"settings"_n, settings>;
         using launches_table = eosio::multi_index<"launches"_n, launch>;
         using accounts = eosio::multi_index<"accounts"_n, account>;
         using stats = eosio::multi_index<"stat"_n, currency_stats>;
         using flexers = eosio::multi_index<"flexers"_n, flexer,
            indexed_by<"bynumber"_n, const_mem_fun<flexer, uint64_t, &flexer::by_number>>
         >;

         void sub_balance(const name& owner, const asset& value);
         void add_balance(const name& owner, const asset& value, const name& ram_payer);
         void update_flex_balance(const name& owner, const asset& value);
         // Create flexer if missing; bumps flexer_count. Returns iterator.
         flexers::const_iterator ensure_flexer(flexers& table, stats& statstable, const name& owner,
                                               const symbol& sym, const name& ram_payer);
         void require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user = name());
         bool is_flex_quote(const extended_asset& quote) const;
         void require_xtoken_tvl(const extended_asset& quote, uint64_t proof_pool_id) const;
   };
}
