// "Copyright [2022] <alcor exchange>"
#ifndef INCLUDE_TICK_HPP_
#define INCLUDE_TICK_HPP_

#include <tuple>
#include <eosio/eosio.hpp>
#include "bit_math.hpp"
#include "constants.hpp"
#include "safe_math.hpp"
#include "tick_math.hpp"
#include "liquidity_math.hpp"

/// @title Tick
/// @notice Contains functions for managing tick processes and relevant calculations
namespace Tick {
// scoped by by token pair
struct [[eosio::table, eosio::contract("alcorswap")]] TickS {
  int32_t id;
  uint64_t liquidityGross;
  int64_t liquidityNet;
  uint128_t feeGrowthOutsideAX64;
  uint128_t feeGrowthOutsideBX64;
  int64_t tickCumulativeOutside;
  uint128_t secondsPerLiquidityOutsideX64;
  uint32_t secondsOutside;
  bool initialized;
  uint64_t primary_key() const { return uint64_t(uint32_t(id)); }
};
typedef eosio::multi_index<"ticks"_n, TickS> ticks_t;

/// @notice Derives max liquidity per tick from given tick spacing
/// @dev Executed within the pool constructor
/// @param tickSpacing The amount of required tick separation, realized in multiples of `tickSpacing`
///     e.g., a tickSpacing of 3 requires ticks to be initialized every 3rd tick i.e., ..., -6, -3, 0, 3, 6, ...
/// @return The max liquidity per tick
uint64_t tickSpacingToMaxLiquidityPerTick(int32_t tickSpacing) {
  int32_t minTick = (TickMath::MIN_TICK / tickSpacing) * tickSpacing;
  int32_t maxTick = (TickMath::MAX_TICK / tickSpacing) * tickSpacing;
  uint32_t numTicks = uint32_t((maxTick - minTick) / tickSpacing) + 1;
  return UINT64_MAX / numTicks;
}

/**
 * Calculates the maximum allowable liquidity per tick with a multiplier.
 *
 * This function takes a maximum liquidity value as input and computes the maximum allowable liquidity per tick
 * by applying a multiplier. It ensures that the result does not exceed the maximum value representable by a
 * 64-bit unsigned integer. If the result would exceed this limit, the function returns the input maxLiquidity
 * value to avoid overflow.
 *
 * @param maxLiquidity - The maximum liquidity value
 *
 * @return The maximum allowable liquidity per tick with the applied multiplier, or the original maxLiquidity value
 * if the result would exceed the maximum representable value for a 64-bit unsigned integer.
 */
uint64_t getMaxLiquidityPerTickWithMultiplier(uint64_t maxLiquidity) {
  const uint64_t defaultMaxLiquidity = UINT64_MAX / 10;

  if (maxLiquidity > defaultMaxLiquidity){
    return maxLiquidity;
  } else{
    return defaultMaxLiquidity;
  }
}

struct FeeGrowthInsideStructReturn {
  uint128_t feeGrowthInsideAX64;
  uint128_t feeGrowthInsideBX64;
};
/// @notice Retrieves fee growth data
/// @param tickLower The lower tick boundary of the position
/// @param tickUpper The upper tick boundary of the position
/// @param tickCurrent The current tick
/// @param feeGrowthGlobalAX64 The all-time global fee growth, per unit of liquidity, in tokenA
/// @param feeGrowthGlobalBX64 The all-time global fee growth, per unit of liquidity, in tokenB
/// @return feeGrowthInsideAX64 The all-time fee growth in tokenA, per unit of liquidity, inside the position's tick
/// boundaries
/// @return feeGrowthInsideBX64 The all-time fee growth in tokenB, per unit of liquidity, inside the position's tick
/// boundaries
std::tuple<uint128_t, uint128_t> getFeeGrowthInside(eosio::name code, uint64_t poolId, int32_t tickLower,
                                                    int32_t tickUpper, int32_t tickCurrent,
                                                    uint128_t feeGrowthGlobalAX64, uint128_t feeGrowthGlobalBX64) {
  ticks_t ticks_table(code, poolId);
  auto lower_itr = ticks_table.find(uint64_t(uint32_t(tickLower)));
  auto upper_itr = ticks_table.find(uint64_t(uint32_t(tickUpper)));

  // calculate fee growth below
  uint128_t feeGrowthBelowAX64 = 0;
  uint128_t feeGrowthBelowBX64 = 0;
  if (tickCurrent >= tickLower) {
    feeGrowthBelowAX64 = (lower_itr != ticks_table.end()) ? lower_itr->feeGrowthOutsideAX64 : 0;
    feeGrowthBelowBX64 = (lower_itr != ticks_table.end()) ? lower_itr->feeGrowthOutsideBX64 : 0;
  } else {
    feeGrowthBelowAX64 =
        SafeMath::sub(feeGrowthGlobalAX64, (lower_itr != ticks_table.end()) ? lower_itr->feeGrowthOutsideAX64 : 0);
    feeGrowthBelowBX64 =
        SafeMath::sub(feeGrowthGlobalBX64, (lower_itr != ticks_table.end()) ? lower_itr->feeGrowthOutsideBX64 : 0);
  }

  // calculate fee growth above
  uint128_t feeGrowthAboveAX64;
  uint128_t feeGrowthAboveBX64;
  if (tickCurrent < tickUpper) {
    feeGrowthAboveAX64 = (upper_itr != ticks_table.end()) ? upper_itr->feeGrowthOutsideAX64 : 0;
    feeGrowthAboveBX64 = (upper_itr != ticks_table.end()) ? upper_itr->feeGrowthOutsideBX64 : 0;
  } else {
    feeGrowthAboveAX64 =
        SafeMath::sub(feeGrowthGlobalAX64, (upper_itr != ticks_table.end()) ? upper_itr->feeGrowthOutsideAX64 : 0);
    feeGrowthAboveBX64 =
        SafeMath::sub(feeGrowthGlobalBX64, (upper_itr != ticks_table.end()) ? upper_itr->feeGrowthOutsideBX64 : 0);
  }
  uint128_t feeGrowthInsideAX64 = feeGrowthGlobalAX64 - feeGrowthBelowAX64 - feeGrowthAboveAX64;
  uint128_t feeGrowthInsideBX64 = feeGrowthGlobalBX64 - feeGrowthBelowBX64 - feeGrowthAboveBX64;

  return {feeGrowthInsideAX64, feeGrowthInsideBX64};
}

/// @notice Updates a tick and returns true if the tick was flipped from initialized to uninitialized, or vice versa
/// @param tick The tick that will be updated
/// @param tickCurrent The current tick
/// @param liquidityDelta A new amount of liquidity to be added (subtracted) when tick is crossed from left to right
/// (right to left)
/// @param feeGrowthGlobalAX64 The all-time global fee growth, per unit of liquidity, in tokenA
/// @param feeGrowthGlobalBX64 The all-time global fee growth, per unit of liquidity, in tokenB
/// @param secondsPerLiquidityCumulativeX64 The all-time seconds per max(1, liquidity) of the pool
/// @param tickCumulative The tick * time elapsed since the pool was first initialized
/// @param time The current block timestamp cast to a uint32
/// @param upper true for updating a position's upper tick, or false for updating a position's lower tick
/// @param maxLiquidity The maximum liquidity allocation for a single tick
/// @return flipped Whether the tick was flipped from initialized to uninitialized, or vice versa
bool update(eosio::name code, eosio::name ram_payer, uint64_t poolId, int32_t tick, int32_t tickCurrent,
            int64_t liquidityDelta, uint128_t feeGrowthGlobalAX64, uint128_t feeGrowthGlobalBX64,
            uint128_t secondsPerLiquidityCumulativeX64, int64_t tickCumulative, uint32_t time, bool upper,
            uint64_t maxLiquidity) {
  ticks_t ticks_table(code, poolId);
  auto info_itr = ticks_table.find(uint64_t(uint32_t(tick)));

  uint64_t liquidityGrossBefore = (info_itr == ticks_table.end()) ? 0 : info_itr->liquidityGross;
  bool initialized = (info_itr != ticks_table.end()) ? info_itr->initialized : false;

  uint64_t liquidityGrossAfter = LiquidityMath::addDelta(liquidityGrossBefore, liquidityDelta);

  eosio::check(liquidityGrossAfter <= getMaxLiquidityPerTickWithMultiplier(maxLiquidity), "ExceedMaxLiquidityPerTick");

  bool flipped = (liquidityGrossAfter == 0) != (liquidityGrossBefore == 0);

  if (liquidityGrossBefore == 0) {
    // by convention, we assume that all growth before a tick was initialized happened _below_ the tick
    if (tick <= tickCurrent) {
      if (info_itr == ticks_table.end()) {
        ticks_table.emplace(ram_payer, [&](auto &rec) {
          rec.id = tick;
          rec.feeGrowthOutsideAX64 = feeGrowthGlobalAX64;
          rec.feeGrowthOutsideBX64 = feeGrowthGlobalBX64;
          rec.secondsPerLiquidityOutsideX64 = secondsPerLiquidityCumulativeX64;
          rec.tickCumulativeOutside = tickCumulative;
          rec.secondsOutside = time;
        });
      } else {
        ticks_table.modify(info_itr, eosio::same_payer, [&](auto &rec) {
          rec.feeGrowthOutsideAX64 = feeGrowthGlobalAX64;
          rec.feeGrowthOutsideBX64 = feeGrowthGlobalBX64;
          rec.secondsPerLiquidityOutsideX64 = secondsPerLiquidityCumulativeX64;
          rec.tickCumulativeOutside = tickCumulative;
          rec.secondsOutside = time;
        });
      }
    }
    initialized = true;
  }
  // when the lower (upper) tick is crossed left to right (right to left), liquidity must be added (removed)
  auto liquidityNet = upper ? SafeMath::sub(info_itr->liquidityNet, liquidityDelta)
                            : SafeMath::add(info_itr->liquidityNet, liquidityDelta);

  info_itr = ticks_table.find(uint64_t(uint32_t(tick)));
  if (info_itr != ticks_table.end()) {
    ticks_table.modify(info_itr, eosio::same_payer, [&](auto &rec) {
      rec.initialized = initialized;
      rec.liquidityGross = liquidityGrossAfter;
      rec.liquidityNet = liquidityNet;
    });
  } else {
    ticks_table.emplace(ram_payer, [&](auto &rec) {
      rec.id = tick;
      rec.initialized = initialized;
      rec.liquidityGross = liquidityGrossAfter;
      rec.liquidityNet = liquidityNet;
    });
  }
  return flipped;
}

/// @notice Clears tick data
/// @param tick The tick that will be cleared
void clear(eosio::name code, uint64_t poolId, int32_t tick) {
  ticks_t ticks_table(code, poolId);
  auto info_itr = ticks_table.require_find(uint64_t(uint32_t(tick)), "TickNotFound");
  ticks_table.erase(info_itr);
}

/// @notice Transitions to next tick as needed by price movement
/// @param tick The destination tick of the transition
/// @param feeGrowthGlobalAX64 The all-time global fee growth, per unit of liquidity, in tokenA
/// @param feeGrowthGlobalBX64 The all-time global fee growth, per unit of liquidity, in tokenB
/// @param secondsPerLiquidityCumulativeX64 The current seconds per liquidity
/// @param tickCumulative The tick * time elapsed since the pool was first initialized
/// @param time The current block.timestamp
/// @return liquidityNet The amount of liquidity added (subtracted) when tick is crossed from left to right (right to
/// left)
int64_t cross(eosio::name code, uint64_t poolId, int32_t tick, uint128_t feeGrowthGlobalAX64,
              uint128_t feeGrowthGlobalBX64, uint128_t secondsPerLiquidityCumulativeX64, int64_t tickCumulative,
              uint32_t time) {
  ticks_t ticks_table(code, poolId);
  auto info_itr = ticks_table.require_find(uint64_t(uint32_t(tick)), "TickNotFound");
  ticks_table.modify(info_itr, eosio::same_payer, [&](auto &rec) {
    rec.feeGrowthOutsideAX64 = SafeMath::sub(feeGrowthGlobalAX64, info_itr->feeGrowthOutsideAX64);
    rec.feeGrowthOutsideBX64 = SafeMath::sub(feeGrowthGlobalBX64, info_itr->feeGrowthOutsideBX64);
    rec.secondsPerLiquidityOutsideX64 =
        SafeMath::sub(secondsPerLiquidityCumulativeX64, info_itr->secondsPerLiquidityOutsideX64);
    rec.tickCumulativeOutside = SafeMath::sub(tickCumulative, info_itr->tickCumulativeOutside);
    rec.secondsOutside = SafeMath::sub(time, info_itr->secondsOutside);
  });
  return info_itr->liquidityNet;
}
}  // namespace Tick
#endif  // INCLUDE_TICK_HPP_
