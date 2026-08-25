// "Copyright [2022] <alcor exchange>"
#ifndef INCLUDE_POSITION_HPP_
#define INCLUDE_POSITION_HPP_

#include <eosio/eosio.hpp>

#include "bit_math.hpp"
#include "constants.hpp"
#include "full_math.hpp"
#include "liquidity_math.hpp"
#include "safe_cast.hpp"
#include "safe_math.hpp"
#include "tick_math.hpp"

/// @title Position
/// @notice Contains functions for managing tick processes and relevant
/// calculations
namespace Position {
static uint128_t get_position_key(eosio::name owner, int32_t tickLower, int32_t tickUpper) {
  return (uint128_t(owner.value) << 64) | (uint128_t(uint32_t(tickLower)) << 32) | (uint128_t(uint32_t(tickUpper)));
}
// scoped by poolId
struct [[eosio::table, eosio::contract("alcorswap")]] PositionS {
  uint64_t id;
  eosio::name owner;
  int32_t tickLower;
  int32_t tickUpper;
  uint64_t liquidity;
  uint128_t feeGrowthInsideALastX64;
  uint128_t feeGrowthInsideBLastX64;
  // the fees owed to the position owner in tokenA/tokenB
  uint64_t feesA;
  uint64_t feesB;

  uint64_t primary_key() const { return id; }
  uint128_t by_second_key() const { return get_position_key(owner, tickLower, tickUpper); }
  uint64_t by_owner() const { return owner.value; }
};
typedef eosio::multi_index<
    "positions"_n, PositionS,
    eosio::indexed_by<"buykey"_n, eosio::const_mem_fun<PositionS, uint128_t, &PositionS::by_second_key>>,
    eosio::indexed_by<"buyowner"_n, eosio::const_mem_fun<PositionS, uint64_t, &PositionS::by_owner>>>
    positions_t;

/// @notice Returns the Info struct of a position, given an owner and position
/// boundaries
/// @param owner The address of the position owner
/// @param tickLower The lower tick boundary of the position
/// @param tickUpper The upper tick boundary of the position
/// @return position The position info struct of the given owners' position
PositionS get(eosio::name code, uint64_t poolId, eosio::name owner, int32_t tickLower, int32_t tickUpper) {
  positions_t positions_table(code, poolId);
  auto positions_index_by_key = positions_table.get_index<"buykey"_n>();
  auto pos_itr = positions_index_by_key.require_find(get_position_key(owner, tickLower, tickUpper), "PositionNotFound");
  return *pos_itr;
}

void create(eosio::name code, eosio::name ram_payer, uint64_t poolId, uint64_t posId, eosio::name owner,
            int32_t tickLower, int32_t tickUpper) {
  positions_t positions_table(code, poolId);
  auto positions_index_by_key = positions_table.get_index<"buykey"_n>();
  auto pos_itr = positions_index_by_key.find(get_position_key(owner, tickLower, tickUpper));
  eosio::check(pos_itr == positions_index_by_key.end(), "Postion already exist");
  positions_table.emplace(ram_payer, [&](auto &row) {
    row.id = posId;
    row.owner = owner;
    row.tickLower = tickLower;
    row.tickUpper = tickUpper;
    row.liquidity = 0;
    row.feeGrowthInsideALastX64 = 0;
    row.feeGrowthInsideBLastX64 = 0;
    row.feesA = 0;
    row.feesB = 0;
  });
}
/// @notice Credits accumulated fees to a user's position
/// @param self The individual position to update
/// @param liquidityDelta The change in pool liquidity as a result of the
/// position update
/// @param feeGrowthInsideAX64 The all-time fee growth in tokenA, per unit of
/// liquidity, inside the position's tick boundaries
/// @param feeGrowthInsideBX64 The all-time fee growth in tokenB, per unit of
/// liquidity, inside the position's tick boundaries
void update(eosio::name code, uint64_t poolId, eosio::name owner, int32_t tickLower, int32_t tickUpper,
            int64_t liquidityDelta, uint128_t feeGrowthInsideAX64, uint128_t feeGrowthInsideBX64) {
  positions_t positions_table(code, poolId);
  auto positions_index_by_key = positions_table.get_index<"buykey"_n>();
  auto pos_itr = positions_index_by_key.require_find(get_position_key(owner, tickLower, tickUpper),
                                                     "Sanity check: Position not found");

  uint128_t feeGrowthInsideALastX64 = pos_itr->feeGrowthInsideALastX64;
  uint128_t feeGrowthInsideBLastX64 = pos_itr->feeGrowthInsideBLastX64;
  uint64_t liquidity = pos_itr->liquidity;

  uint64_t liquidityNext = 0;
  if (liquidityDelta == 0) {
    eosio::check(liquidity > 0, "InvalidUpdateWithZeroLiquidity");
    liquidityNext = liquidity;
  } else {
    liquidityNext = LiquidityMath::addDelta(pos_itr->liquidity, liquidityDelta);
  }

  // calculate accumulated fees
  uint64_t feesA = SafeCast::toUint64(
      FullMath::mulDiv(feeGrowthInsideAX64 - feeGrowthInsideALastX64, uint128_t(liquidity), Q64));
  uint64_t feesB = SafeCast::toUint64(
      FullMath::mulDiv(feeGrowthInsideBX64 - feeGrowthInsideBLastX64, uint128_t(liquidity), Q64));

  positions_index_by_key.modify(pos_itr, eosio::same_payer, [&](auto &row) {
    row.liquidity = liquidityNext;
    row.feeGrowthInsideALastX64 = feeGrowthInsideAX64;
    row.feeGrowthInsideBLastX64 = feeGrowthInsideBX64;
    row.feesA = SafeMath::add(row.feesA, feesA);
    row.feesB = SafeMath::add(row.feesB, feesB);
  });
}

bool isEmpty(eosio::name code, uint64_t poolId) {
  positions_t positions_table(code, poolId);
  return (positions_table.begin() == positions_table.end());
}
}  // namespace Position
#endif  // INCLUDE_POSITION_HPP_
