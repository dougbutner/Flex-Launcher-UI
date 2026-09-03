#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/time.hpp>

namespace eosio {

   using std::string;

   /**
    * easyflex — takeiteasy-style reflections, anyone can create.
    *
    * Same launch lock and protocol skim as flexforex (startlaunch + liftoff,
    * 90-day one-sided Alcor lock, nyra/reflections bps on xtoken quotes).
    * No inheritance, project tax, Angel numbers, or Jackpot.
    */
   class [[eosio::contract("easyflex")]] easyflex : public contract {
      public:
         using contract::contract;

         ACTION create(const name& issuer, const asset& maximum_supply);
         ACTION issue(const name& to, const asset& quantity, const string& memo);
         ACTION burn(const name& username, const asset& quantity, const string& memo);
         ACTION transfer(const name& from, const name& to, const asset& quantity, const string& memo);
         ACTION open(const name& owner, const symbol& symbol, const name& ram_payer);
         ACTION close(const name& owner, const symbol& symbol);
         ACTION distribute(const string& token_symbol);
         ACTION setconfig(const symbol& sym, uint64_t start_key, uint32_t limit, uint16_t reflection_rate,
                          uint16_t burn_rate, const name& admin_account);
         ACTION feeoptout(const name& account, const bool& ban_status, const string& token_symbol);
         ACTION addpool(const uint64_t& pool_id, const string& token_symbol, const symbol& output_symbol,
                            const name& output_contract);
         ACTION choosereward(const name& owner, const string& token_symbol, const symbol& output_symbol,
                             const name& output_contract);
         ACTION startlaunch(const string& token_symbol, const extended_asset& quote, uint32_t fee, int32_t tick_lower,
                          int32_t tick_upper, const uint128_t& sqrt_price_x64, uint64_t xtoken_proof_pool_id);
         ACTION liftoff(const string& token_symbol, uint64_t pool_id, int32_t tick_lower, int32_t tick_upper);

         static asset get_supply(const name& token_contract_account, const symbol_code& sym_code) {
            stats statstable(token_contract_account, sym_code.raw());
            return statstable.get(sym_code.raw(), "⟁ invalid supply symbol code 🤷").supply;
         }

         static asset get_balance(const name& token_contract_account, const name& owner, const symbol_code& sym_code) {
            accounts accountstable(token_contract_account, owner.value);
            return accountstable.get(sym_code.raw(), "⟁ no balance with specified symbol 🤷").balance;
         }

         using create_action = eosio::action_wrapper<"create"_n, &easyflex::create>;
         using issue_action = eosio::action_wrapper<"issue"_n, &easyflex::issue>;
         using burn_action = eosio::action_wrapper<"burn"_n, &easyflex::burn>;
         using transfer_action = eosio::action_wrapper<"transfer"_n, &easyflex::transfer>;
         using open_action = eosio::action_wrapper<"open"_n, &easyflex::open>;
         using close_action = eosio::action_wrapper<"close"_n, &easyflex::close>;
         using distribute_action = eosio::action_wrapper<"distribute"_n, &easyflex::distribute>;
         using setconfig_action = eosio::action_wrapper<"setconfig"_n, &easyflex::setconfig>;
         using feeoptout_action = eosio::action_wrapper<"feeoptout"_n, &easyflex::feeoptout>;
         using addpool_action = eosio::action_wrapper<"addpool"_n, &easyflex::addpool>;
         using choosereward_action = eosio::action_wrapper<"choosereward"_n, &easyflex::choosereward>;
         using startlaunch_action = eosio::action_wrapper<"startlaunch"_n, &easyflex::startlaunch>;
         using liftoff_action = eosio::action_wrapper<"liftoff"_n, &easyflex::liftoff>;

         static constexpr name SWAP_ALCOR = "swap.alcor"_n;
         static constexpr name XTOKENS = "xtokens"_n;
         static constexpr uint32_t MIN_LOCK_SECS = 90 * 24 * 60 * 60;
         static constexpr int32_t MIN_TICK = -443636;
         static constexpr int32_t MAX_TICK = 443636;
         static constexpr uint16_t PROTO_BPS_HALF = 25;

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
            uint64_t primary_key()const { return supply.symbol.code().raw(); }
         };

         TABLE flexer {
            name     owner;
            asset    balance;
            bool     fee_opted_out = false;
            uint64_t flex_reward_pool_id = 0;     // 0 = native; else Alcor pool id in flexpools
            uint64_t primary_key()const { return owner.value; }
         };

         // Per-token config. Scope = symbol code.
         TABLE settings {
            symbol    token_symbol;
            uint64_t  start_key = 0;
            uint32_t  limit = 100;
            uint16_t  reflection_rate = 100;
            uint16_t  burn_rate = 100;
            name      admin_account;
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
            uint64_t primary_key()const { return token_symbol.code().raw(); }
         };

         using settings_table = eosio::multi_index<"settings"_n, settings>;
         using launches_table = eosio::multi_index<"launches"_n, launch>;
         using accounts = eosio::multi_index<"accounts"_n, account>;
         using stats = eosio::multi_index<"stat"_n, currency_stats>;
         using flexers = eosio::multi_index<"flexers"_n, flexer>;

         void sub_balance(const name& owner, const asset& value);
         void add_balance(const name& owner, const asset& value, const name& ram_payer);
         void update_flex_balance(const name& owner, const asset& value);
         flexers::const_iterator ensure_flexer(flexers& table, const name& owner, const symbol& sym, const name& ram_payer);
         void require_token_auth(const currency_stats& st, const settings& conf, const name& optional_user = name());
   };
}
