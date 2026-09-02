// Alcor Swap (concentrated liquidity, v2) — third-party integration interface.
//
// Self-contained: only depends on eosio headers, no Alcor internals, no
// wide-integer library. Drop it next to your contract and #include it.
//
// Contains everything needed to, from your own smart contract:
//   1. create a pool
//   2. deposit tokens into your Alcor balance
//   3. open a range position (addliquid)
//   4. lock that position until a date (lockpos)
//   5. read back pools / positions / balances / locks
//
// Your contract account must have `eosio.code` on its active permission:
//   cleos set account permission <your_contract> active --add-code
// and must carry the RAM for the rows it creates (balance, position, ticks,
// bitmap, lock).
#ifndef ALCORSWAP_INTERFACE_HPP_
#define ALCORSWAP_INTERFACE_HPP_

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <string>
#include <vector>

namespace alcor {

using eosio::asset;
using eosio::checksum256;
using eosio::extended_asset;
using eosio::name;

// ---------------------------------------------------------------------------
// Tables (read-only mirrors of the swap contract's state)
// Field order is part of the wire format — do not reorder.
// ---------------------------------------------------------------------------

struct CurrSlotS {
  uint128_t sqrtPriceX64;  // current sqrt(tokenB/tokenA) as Q64.64
  int32_t tick;            // tick of the current price
  uint32_t lastObservationTimestamp;
  uint32_t currentObservationNum;
  uint32_t maxObservationNum;

  EOSLIB_SERIALIZE(CurrSlotS, (sqrtPriceX64)(tick)(lastObservationTimestamp)(currentObservationNum)(maxObservationNum))
};

// scope: swap contract account
struct PoolS {
  uint64_t id;
  bool active;  // false until the creation fee is paid, see `activepool` memo
  extended_asset tokenA;
  extended_asset tokenB;
  uint32_t fee;  // fee/1e6: 500 | 3000 | 10000
  uint8_t feeProtocol;
  int32_t tickSpacing;  // 10 | 60 | 200 — position ticks must be multiples
  uint64_t maxLiquidityPerTick;
  CurrSlotS currSlot;
  uint128_t feeGrowthGlobalAX64;
  uint128_t feeGrowthGlobalBX64;
  asset protocolFeeA;
  asset protocolFeeB;
  uint64_t liquidity;

  uint64_t primary_key() const { return id; }

  EOSLIB_SERIALIZE(PoolS, (id)(active)(tokenA)(tokenB)(fee)(feeProtocol)(tickSpacing)(maxLiquidityPerTick)(currSlot)(
                              feeGrowthGlobalAX64)(feeGrowthGlobalBX64)(protocolFeeA)(protocolFeeB)(liquidity))
};
typedef eosio::multi_index<"pools"_n, PoolS> pools_t;

// scope: poolId
struct PositionS {
  uint64_t id;  // globally unique position id
  name owner;
  int32_t tickLower;
  int32_t tickUpper;
  uint64_t liquidity;
  uint128_t feeGrowthInsideALastX64;
  uint128_t feeGrowthInsideBLastX64;
  uint64_t feesA;  // uncollected fees, tokenA
  uint64_t feesB;  // uncollected fees, tokenB

  uint64_t primary_key() const { return id; }
  uint128_t by_second_key() const {
    return (uint128_t(owner.value) << 64) | (uint128_t(uint32_t(tickLower)) << 32) | uint128_t(uint32_t(tickUpper));
  }
  uint64_t by_owner() const { return owner.value; }

  EOSLIB_SERIALIZE(PositionS, (id)(owner)(tickLower)(tickUpper)(liquidity)(feeGrowthInsideALastX64)(
                                  feeGrowthInsideBLastX64)(feesA)(feesB))
};
typedef eosio::multi_index<
    "positions"_n, PositionS,
    eosio::indexed_by<"buykey"_n, eosio::const_mem_fun<PositionS, uint128_t, &PositionS::by_second_key>>,
    eosio::indexed_by<"buyowner"_n, eosio::const_mem_fun<PositionS, uint64_t, &PositionS::by_owner>>>
    positions_t;

// scope: owner account. Tokens sitting in the exchange, not yet in a position.
struct BalanceS {
  uint64_t id;
  extended_asset assetBalance;

  uint64_t primary_key() const { return id; }

  EOSLIB_SERIALIZE(BalanceS, (id)(assetBalance))
};
typedef eosio::multi_index<"balances"_n, BalanceS> balances_t;

// scope: swap contract account. Absent row == position not locked.
struct LockS {
  uint64_t pos_id;
  uint32_t unlockTime;  // seconds since epoch

  uint64_t primary_key() const { return pos_id; }

  EOSLIB_SERIALIZE(LockS, (pos_id)(unlockTime))
};
typedef eosio::multi_index<"locks"_n, LockS> locks_t;

// scope: swap contract account. id = 0 is the live config row.
struct SystemS {
  uint64_t id;
  bool active;
  uint64_t poolIdCounter;
  uint64_t posIdCounter;
  extended_asset activeFee;

  uint64_t primary_key() const { return id; }

  EOSLIB_SERIALIZE(SystemS, (id)(active)(poolIdCounter)(posIdCounter)(activeFee))
};
typedef eosio::multi_index<"system"_n, SystemS> system_t;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

inline SystemS get_system(name swap_contract) {
  system_t sys(swap_contract, swap_contract.value);
  return sys.get(0, "alcor: system row not found");
}

inline extended_asset get_active_fee(name swap_contract) { return get_system(swap_contract).activeFee; }

/// Unused tokens sitting on Alcor for `owner` (not yet in a position). 0 if none.
inline int64_t get_unused_balance(name swap_contract, name owner, name token_contract, eosio::symbol sym) {
  balances_t bals(swap_contract, owner.value);
  for (auto itr = bals.begin(); itr != bals.end(); ++itr) {
    if (itr->assetBalance.contract == token_contract && itr->assetBalance.quantity.symbol == sym)
      return itr->assetBalance.quantity.amount;
  }
  return 0;
}

inline PoolS get_pool(name swap_contract, uint64_t poolId) {
  pools_t pools(swap_contract, swap_contract.value);
  return pools.get(poolId, "alcor: poolId not found");
}

inline PositionS get_position(name swap_contract, uint64_t poolId, name owner, int32_t tickLower, int32_t tickUpper) {
  positions_t positions(swap_contract, poolId);
  auto by_key = positions.get_index<"buykey"_n>();
  const uint128_t key =
      (uint128_t(owner.value) << 64) | (uint128_t(uint32_t(tickLower)) << 32) | uint128_t(uint32_t(tickUpper));
  return *by_key.require_find(key, "alcor: position not found");
}

/// @return unlockTime, or 0 when the position carries no lock.
inline uint32_t get_unlock_time(name swap_contract, uint64_t posId) {
  locks_t locks(swap_contract, swap_contract.value);
  auto itr = locks.find(posId);
  return itr == locks.end() ? 0 : itr->unlockTime;
}

// ---------------------------------------------------------------------------
// Actions — inline senders. `sender` is the account whose auth is used; for a
// contract acting on its own behalf that is your contract account (needs
// eosio.code).
// ---------------------------------------------------------------------------

/// @notice Move tokens into your Alcor balance. Required before `addliquid`.
/// @dev Plain token transfer with the memo "deposit".
inline void deposit(name sender, name swap_contract, extended_asset quantity) {
  eosio::action(eosio::permission_level{sender, "active"_n}, quantity.contract, "transfer"_n,
                std::make_tuple(sender, swap_contract, quantity.quantity, std::string("deposit")))
      .send();
}

/// @notice Withdraw an unused balance back to `owner`.
inline void withdraw(name sender, name swap_contract, name owner, extended_asset quantity) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "withdraw"_n,
                std::make_tuple(owner, quantity))
      .send();
}

/// @notice Create a pool for the (tokenA, tokenB, fee) triple.
/// @param tokenA,tokenB Zero-amount extended_assets. MUST be sorted:
///        tokenA.contract <= tokenB.contract, and when the contracts are equal,
///        tokenA symbol code < tokenB symbol code.
/// @param sqrtPriceX64 Initial sqrt(tokenB/tokenA) as a Q64.64 fixed point
///        number, i.e. sqrt(price) * 2^64. 1:1 == 2^64 == 18446744073709551616.
/// @param fee 500, 3000 or 10000 (tick spacing 10, 60, 200 respectively).
/// @dev If the exchange charges a pool creation fee, the pool is created with
///      active == false and only becomes tradable after a transfer of exactly
///      that fee with the memo "activepool#<poolId>" (see activate_pool below).
inline void createpool(name sender, name swap_contract, name account, extended_asset tokenA, extended_asset tokenB,
                       uint128_t sqrtPriceX64, uint32_t fee) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "createpool"_n,
                std::make_tuple(account, tokenA, tokenB, sqrtPriceX64, fee))
      .send();
}

/// @notice Pay the pool activation fee. Amount must equal system.activeFee.
inline void activate_pool(name sender, name swap_contract, uint64_t poolId, extended_asset fee) {
  eosio::action(eosio::permission_level{sender, "active"_n}, fee.contract, "transfer"_n,
                std::make_tuple(sender, swap_contract, fee.quantity, "activepool#" + std::to_string(poolId)))
      .send();
}

/// @notice Open (or add to) a range position. Funded from `owner`'s deposited
///         balance, so `deposit` both sides first.
/// @param tickLower,tickUpper Range bounds. Both MUST be multiples of the
///        pool's tickSpacing, tickLower < tickUpper, within +-443636.
/// @param tokenAMin,tokenBMin Slippage guard; pass zero-amount assets of the
///        right symbols to skip the check.
/// @param deadline Seconds since epoch, or 0 for no deadline.
/// @dev A position is identified by (poolId, owner, tickLower, tickUpper).
///      Calling it twice with the same range adds to the same position.
inline void addliquid(name sender, name swap_contract, uint64_t poolId, name owner, asset tokenADesired,
                      asset tokenBDesired, int32_t tickLower, int32_t tickUpper, asset tokenAMin, asset tokenBMin,
                      uint32_t deadline = 0) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "addliquid"_n,
                std::make_tuple(poolId, owner, tokenADesired, tokenBDesired, tickLower, tickUpper, tokenAMin, tokenBMin,
                                deadline))
      .send();
}

/// @notice Remove liquidity from a position back into the owner's balance.
/// @dev Rejected while the position is locked.
inline void subliquid(name sender, name swap_contract, uint64_t poolId, name owner, uint64_t liquidity,
                      int32_t tickLower, int32_t tickUpper, asset tokenAMin, asset tokenBMin, uint32_t deadline = 0) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "subliquid"_n,
                std::make_tuple(poolId, owner, liquidity, tickLower, tickUpper, tokenAMin, tokenBMin, deadline))
      .send();
}

/// @notice Lock a position's liquidity until `unlockTime`.
/// @param unlockTime Seconds since epoch, must be in the future.
/// @dev While locked, `subliquid` and `transferpos` on that position fail with
///      "position is locked". `collect`, farming and reward claims keep working,
///      so a launcher can still harvest the trading fees of a locked position.
///      A lock can only be extended, never shortened — calling again with an
///      earlier time fails with "cannot shorten an existing lock". There is no
///      unlock action: the lock expires on its own at `unlockTime`.
///      The position must hold liquidity, so call it after `addliquid`.
inline void lockpos(name sender, name swap_contract, uint64_t poolId, name owner, int32_t tickLower, int32_t tickUpper,
                    uint32_t unlockTime) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "lockpos"_n,
                std::make_tuple(poolId, owner, tickLower, tickUpper, unlockTime))
      .send();
}

/// @notice Collect accrued trading fees of a position to `recipient`.
/// @param tokenAMax,tokenBMax Upper bound per side; pass the position's feesA /
///        feesB (or asset(max, symbol)) to take everything.
inline void collect(name sender, name swap_contract, uint64_t poolId, name owner, name recipient, int32_t tickLower,
                    int32_t tickUpper, asset tokenAMax, asset tokenBMax) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "collect"_n,
                std::make_tuple(poolId, owner, recipient, tickLower, tickUpper, tokenAMax, tokenBMax))
      .send();
}

/// @notice Hand a whole position over to another account.
/// @dev Rejected while the position is locked.
inline void transferpos(name sender, name swap_contract, uint64_t poolId, name owner, name to, int32_t tickLower,
                        int32_t tickUpper, std::string memo) {
  eosio::action(eosio::permission_level{sender, "active"_n}, swap_contract, "transferpos"_n,
                std::make_tuple(poolId, owner, to, tickLower, tickUpper, memo))
      .send();
}

// ---------------------------------------------------------------------------
// Notes on the launch flow
// ---------------------------------------------------------------------------
//
// Typical sequence from a launcher contract (all inline, one transaction is
// fine except where the pool id has to be read back):
//
//   1. createpool(...)          -> pool id comes from the `logpool` inline
//                                  action, or read the pools table by the
//                                  (tokenA, tokenB, fee) triple afterwards.
//   2. activate_pool(...)       -> only if a creation fee is configured.
//   3. deposit(tokenA); deposit(tokenB)
//   4. addliquid(poolId, self, ..., tickLower, tickUpper, ...)
//   5. lockpos(poolId, self, tickLower, tickUpper, unlockTime)
//
// Steps 4 and 5 cannot be squeezed into the same inline chain as 1 if you need
// the new poolId inside the same action — inline actions execute after the
// current one returns, so the pool row does not exist yet. Either pass the
// poolId in from the outside on a second call, or read the pools table by
// (tokenA, tokenB, fee) in a follow-up action.
//
// One-sided launch: to seed a range entirely above (or below) the current
// price, set the range so the current tick sits outside it — then only one of
// tokenADesired / tokenBDesired is consumed and the other can be 0.
//
// sqrtPriceX64 for a tick is sqrt(1.0001^tick) * 2^64. Computing it on-chain
// pulls in Alcor's 256-bit math headers; it is usually simpler to pass the
// value in as an action parameter, precomputed off-chain.
//
// ---------------------------------------------------------------------------
}  // namespace alcor

#endif  // ALCORSWAP_INTERFACE_HPP_
