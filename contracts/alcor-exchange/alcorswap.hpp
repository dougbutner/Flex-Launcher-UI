// "Copyright [2022] <alcor exchange>"
#ifndef INCLUDE_ALCORSWAP_HPP_
#define INCLUDE_ALCORSWAP_HPP_

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>
#include <string>
#include <tuple>
#include <vector>

#include "eosio_system.hpp"
#include "helper.hpp"
#include "liquidity_math.hpp"
#include "oracle.hpp"
#include "position.hpp"
#include "sqrt_price_math.hpp"
#include "swap_math.hpp"
#include "tick.hpp"
#include "tick_bitmap.hpp"
#include "tick_math.hpp"
#include "token_interface.hpp"

using namespace eosio;
CONTRACT alcorswap : public eosio::contract {
 public:
  using contract::contract;

  alcorswap(name receiver, name code, datastream<const char*> ds)
      : contract(receiver, code, ds),
        system_(get_self(), get_self().value),
        markets_(get_self(), get_self().value),
        pools_(get_self(), get_self().value),
        forzenpools_(get_self(), get_self().value),
        banlist_(get_self(), get_self().value),
        whitelist_(get_self(), get_self().value),
        incentives_(get_self(), get_self().value),
        stakingpos_(get_self(), get_self().value),
        incentivefee_(get_self(), get_self().value) {}

  [[eosio::on_notify("*::transfer")]] void on_transfer(name from, name to, asset quantity, std::string memo);

  ACTION init();
  ACTION banacc(name acc, bool isBan = true);
  ACTION setactivefee(name contract, asset fee);
  ACTION freezepool(uint64_t poolId, bool frozen, bool isUnlockLiquidityA, bool isUnlockLiquidityB);
  ACTION setincentfee(name contract, asset fee);
  ACTION setactive(bool active);
  ACTION regmarket(name marketName, uint32_t marketFee);
  ACTION withdraw(name owner, eosio::extended_asset assetInput);
  ACTION createpool(name account, extended_asset tokenA, extended_asset tokenB, uint128_t sqrtPriceX64, uint32_t fee);
  ACTION addliquid(uint64_t poolId, name owner, asset tokenADesired, asset tokenBDesired, int32_t tickLower,
                   int32_t tickUpper, asset tokenAMin, asset tokenBMin, uint32_t deadline);
  ACTION subliquid(uint64_t poolId, name owner, uint64_t liquidity, int32_t tickLower, int32_t tickUpper,
                   asset tokenAMin, asset tokenBMin, uint32_t deadline);
  ACTION transferpos(uint64_t poolId, name owner, name to, int32_t tickLower, int32_t tickUpper, std::string memo);
  ACTION collect(uint64_t poolId, name owner, name recipient, int32_t tickLower, int32_t tickUpper, asset tokenAMax,
                 asset tokenBMax);

  ACTION getfees(uint64_t poolId, name recipient, asset tokenARequested, asset tokenBRequested);
  ACTION setfee(uint64_t poolId, uint8_t feeProtocol);
  ACTION lockpool(uint64_t poolId, bool active);
  ACTION rmvpool(uint64_t poolId);
  ACTION addoraclerow(uint64_t poolId, name payer, int64_t previousRam);

  // staking actions
  ACTION cfgtoken(extended_asset whitelistToken, bool isErase);
  ACTION newincentive(name creator, uint64_t poolId, extended_asset rewardToken, uint32_t duration);
  ACTION stake(uint64_t incentiveId, uint64_t posId);
  ACTION stakelastpos(uint64_t incentiveId);
  ACTION unstake(uint64_t incentiveId, uint64_t posId);
  ACTION unstakepos(uint64_t posId);
  ACTION getreward(uint64_t incentiveId, uint64_t posId);

  TABLE stakereturn {
    uint64_t posId;
    uint64_t incentiveId;
    uint64_t stakingWeight;
    uint64_t rewards;
    uint128_t userRewardPerTokenPaid;
  };
  [[eosio::action]] std::vector<stakereturn> getstakes(std::vector<uint64_t> posIds);

  /// @notice Emitted when create new pool
  ACTION logpool(uint64_t poolId, extended_asset tokenA, extended_asset tokenB, uint32_t fee, uint8_t feeProtocol,
                 uint32_t tickSpacing, uint128_t sqrtPriceX64, int32_t tick) {
    require_auth(get_self());
  }
  /// @notice Emitted when liquidity is minted for a given position
  ACTION logmint(uint64_t poolId, uint64_t posId, name owner, int32_t tickLower, int32_t tickUpper, uint64_t liquidity,
                 asset tokenA, asset tokenB, asset reserveA, asset reserveB, uint128_t sqrtPriceX64, int32_t tick) {
    require_auth(get_self());
  }
  /// @notice Emitted when a position's liquidity is removed
  ACTION logburn(uint64_t poolId, uint64_t posId, name owner, int32_t tickLower, int32_t tickUpper, uint64_t liquidity,
                 asset tokenA, asset tokenB, asset reserveA, asset reserveB, uint128_t sqrtPriceX64, int32_t tick) {
    require_auth(get_self());
  }

  /// @notice Emitted when a position is transferred
  ACTION logtransfer(uint64_t poolId, uint64_t fromPosId, name from, int32_t tickLower, int32_t tickUpper,
                     uint64_t fromLiquidity, uint64_t toPosId, name to, uint64_t toLiquidity, bool isMergePos) {
    require_auth(get_self());
  }

  /// @notice Emitted when fees are collected by the owner of a position
  ACTION logcollect(uint64_t poolId, uint64_t posId, name owner, name recipient, int32_t tickLower, int32_t tickUpper,
                    uint64_t liquidity, asset tokenA, asset tokenB, asset reserveA, asset reserveB,
                    uint128_t sqrtPriceX64, int32_t tick) {
    require_auth(get_self());
  }
  /// @notice Emitted by the pool for any swaps between tokenA and tokenB
  ACTION logswap(uint64_t poolId, name sender, name recipient, asset tokenA, asset tokenB, uint128_t sqrtPriceX64,
                 uint64_t liquidity, int32_t tick, asset reserveA, asset reserveB) {
    require_auth(get_self());
  }
  /// @notice Emitted when the protocol fee is changed by the pool
  ACTION logsetfee(uint64_t poolId, uint8_t feeProtocolOld, uint8_t feeProtocolNew) { require_auth(get_self()); }

  /// @notice Emitted when the collected protocol fees are withdrawn by the contract owner
  ACTION loggetfee(uint64_t poolId, name recipient, asset tokenA, asset tokenB) { require_auth(get_self()); }

  /// @notice Emitted when someone pay token to buy more rows to store oracle price history
  ACTION logaddoracle(uint64_t poolId, name payer, uint32_t rows) { require_auth(get_self()); }

  /// @notice Emitted when someone stake
  ACTION lognewincent(uint64_t incentiveId, name creator, uint64_t poolId, extended_asset rewardToken,
                      uint32_t duration) {
    require_auth(get_self());
  }
  /// @notice Emitted when someone stake
  ACTION logaddreward(uint64_t incentiveId, extended_asset reward) { require_auth(get_self()); }

  /// @notice Emitted when someone stake
  ACTION logstaked(uint64_t incentiveId, name owner, uint64_t posId, uint64_t stakingWeight) {
    require_auth(get_self());
  }

  /// @notice Emitted when someone stake
  ACTION logunstaked(uint64_t incentiveId, name owner, uint64_t posId, uint64_t stakingWeight) {
    require_auth(get_self());
  }

  /// @notice Emitted when someone stake
  ACTION logpaid(uint64_t incentiveId, name owner, extended_asset rewardPaid) { require_auth(get_self()); }

  struct SwapResultS {
    extended_asset amountIn;
    extended_asset amountOut;

    EOSLIB_SERIALIZE(SwapResultS, (amountIn)(amountOut))
  };

  struct SwapStateS {
    // the amount remaining to be swapped in/out of the input/output asset
    int64_t amountSpecifiedRemaining;
    // the amount already swapped out/in of the output/input asset
    int64_t amountCalculated;
    // current sqrt(price)
    uint128_t sqrtPriceX64;
    // the tick associated with the current price
    int32_t tick;
    // the global fee growth of the input token
    uint128_t feeGrowthGlobalX64;
    // amount of input token paid as protocol fee
    uint64_t protocolFee;
    // the current liquidity in range
    uint64_t liquidity;
  };

  struct StepComputationS {
    // the price at the beginning of the step
    uint128_t sqrtPriceStartX64;
    // the next tick to swap to from the current tick in the swap direction
    int32_t tickNext;
    // whether tickNext is initialized or not
    bool initialized;
    // sqrt(price) for the next tick (1/0)
    uint128_t sqrtPriceNextX64;
    // how much is being swapped in in this step
    uint64_t amountIn;
    // how much is being swapped out
    uint64_t amountOut;
    // how much fee is being paid in
    uint64_t feeAmount;
  };

  struct CurrSlotS {
    uint128_t sqrtPriceX64;
    int32_t tick;
    uint32_t lastObservationTimestamp;
    uint32_t currentObservationNum;
    uint32_t maxObservationNum;
  };

  // scoped by self
  TABLE SymtemS {
    uint64_t id;
    bool active;
    uint64_t poolIdCounter;
    uint64_t posIdCounter;
    extended_asset activeFee;

    uint64_t primary_key() const { return id; }
  };
  typedef eosio::multi_index<"system"_n, SymtemS> system_t;

  system_t system_;

  // scoped by self
  TABLE MarketS {
    name marketName;
    uint32_t marketFee;  // marketFee/10^6

    uint64_t primary_key() const { return marketName.value; };
  };
  typedef multi_index<name("markets"), MarketS> markets_t;

  markets_t markets_;

  // scoped by self
  TABLE PoolS {
    uint64_t id;
    bool active;
    extended_asset tokenA;
    extended_asset tokenB;
    uint32_t fee;  // fee/10^6
    uint8_t feeProtocol;
    int32_t tickSpacing;
    uint64_t maxLiquidityPerTick;

    CurrSlotS currSlot;
    // Globals
    uint128_t feeGrowthGlobalAX64;
    uint128_t feeGrowthGlobalBX64;
    asset protocolFeeA;
    asset protocolFeeB;
    uint64_t liquidity;

    uint64_t primary_key() const { return id; }

    checksum256 secondary_key() const { return makePoolKey(tokenA, tokenB); }
  };
  typedef eosio::multi_index<"pools"_n, PoolS,
                             indexed_by<"bypoolkey"_n, const_mem_fun<PoolS, checksum256, &PoolS::secondary_key>>>
      pools_t;

  // scoped by self
  TABLE FrozenPoolS {
    uint64_t poolId;
    bool isUnlockLiquidityA = 0;
    bool isUnlockLiquidityB = 0;

    uint64_t primary_key() const { return poolId; };
  };
  typedef multi_index<name("forzenpools"), FrozenPoolS> forzenpools_t;

  // Balance of user
  // Scope by user
  TABLE BalanceS {
    uint64_t id;
    eosio::extended_asset assetBalance;

    uint64_t primary_key() const { return id; }
    uint128_t secondary_key() const { return extended_to_id(assetBalance); }
  };
  typedef eosio::multi_index<"balances"_n, BalanceS,
                             indexed_by<"byextasset"_n, const_mem_fun<BalanceS, uint128_t, &BalanceS::secondary_key>>>
      balances_t;

  // Scope by self
  TABLE WhitelistTokenS {
    eosio::extended_asset token;
    uint64_t primary_key() const { return token.quantity.symbol.code().raw(); }
  };
  typedef eosio::multi_index<"whitelist"_n, WhitelistTokenS> whitelist_t;

  // Scope by self
  TABLE BannedAccountS {
    name account;
    uint64_t primary_key() const { return account.value; }
  };
  typedef eosio::multi_index<"banlist"_n, BannedAccountS> banlist_t;

  // Scope by self
  // @notice Represents a staking incentive
  TABLE IncentiveS {
    uint64_t id;
    name creator;
    uint64_t poolId;
    eosio::extended_asset reward;
    uint32_t periodFinish = 0;
    uint32_t rewardsDuration;
    uint128_t rewardRateE18 = 0;
    uint128_t rewardPerTokenStored;
    uint64_t totalStakingWeight;
    uint32_t lastUpdateTime;
    uint32_t numberOfStakes;
    uint64_t primary_key() const { return id; }
    uint64_t by_pool() const { return poolId; }
  };
  typedef eosio::multi_index<"incentives"_n, IncentiveS,
    eosio::indexed_by<"bypool"_n, eosio::const_mem_fun<IncentiveS, uint64_t, &IncentiveS::by_pool>>
  > incentives_t;

  // Scope by incentiveId
  // @notice Represents a staked liquidity
  TABLE StakeS {
    uint64_t posId;
    uint64_t stakingWeight = 0;
    uint64_t rewards = 0;
    uint128_t userRewardPerTokenPaid = 0;

    uint64_t primary_key() const { return posId; }
  };
  typedef eosio::multi_index<"stakes"_n, StakeS> stakes_t;

  // Scope by self
  // @notice Represents a active incentiveIds by a position
  TABLE StakingPosS {
    uint64_t posId;
    std::vector<uint64_t> incentiveIds;

    uint64_t primary_key() const { return posId; }
  };
  typedef eosio::multi_index<"stakingpos"_n, StakingPosS> stakingpos_t;

  // Scope by self
  // @notice Represents a staking incentive
  // @notice When id = 0, fees are applied universally for all creating incentives.
  // @notice When id is any other value (referred to as incentiveID), the fee is recorded temporarily.
  // @notice This is used to charge the fee from an incentive and will be removed after the incentive is activated.

  TABLE IncentiveFeeS {
    uint64_t id;
    eosio::extended_asset fee;
    uint64_t primary_key() const { return id; }
  };
  typedef eosio::multi_index<"incentivefee"_n, IncentiveFeeS> incentivefee_t;

  pools_t pools_;
  forzenpools_t forzenpools_;
  banlist_t banlist_;
  whitelist_t whitelist_;
  incentives_t incentives_;
  stakingpos_t stakingpos_;
  incentivefee_t incentivefee_;

 private:
  void _check_system_active();
  void _add_balance(name owner, eosio::extended_asset assetInput);
  void _decrease_balance(name owner, eosio::extended_asset assetInput);

  std::tuple<bool, PoolS> _getPool(extended_asset tokenADesired, extended_asset tokenBDesired, uint32_t fee);

  std::tuple<int64_t, int64_t, uint64_t> _mint(const PoolS& poolInfo, name owner, int32_t tickLower, int32_t tickUpper,
                                               uint64_t liquidity);
  std::tuple<uint64_t, uint64_t, uint64_t> _burn(const PoolS& poolInfo, name owner, int32_t tickLower,
                                                 int32_t tickUpper, uint64_t liquidity);
  int64_t _swapExactInput(const PoolS& poolInfo, name sender, name recipient, bool aForB, asset tokenIn,
                          asset minTokenOut, uint32_t deadline, uint128_t sqrtPriceLimitX64, name marketName);
  int64_t _swapExactOutput(const PoolS& poolInfo, name sender, name recipient, bool aForB, asset tokenOut,
                           asset maxTokenIn, uint32_t deadline, uint128_t sqrtPriceLimitX64, name marketName);
  std::tuple<int64_t, int64_t> _swap(uint64_t poolId, name sender, name recipient, bool aForB, int64_t depositedAmount,
                                     int64_t amountSpecified, uint128_t sqrtPriceLimitX64, name marketName);

  uint64_t _addLiquidity(const PoolS& poolInfo, name owner, asset tokenADesired, asset tokenBDesired, int32_t tickLower,
                         int32_t tickUpper, asset tokenAMin, asset tokenBMin);

  std::tuple<Position::PositionS, int64_t, int64_t> _modifyPosition(
      const PoolS& poolInfo, name owner, int32_t tickLower, int32_t tickUpper, int64_t liquidityDelta);
  Position::PositionS _updatePosition(const PoolS& poolInfo, name owner, int32_t tickLower, int32_t tickUpper,
                                      int64_t liquidityDelta, int32_t tick);
  void _sendToken(uint64_t poolId, bool isTokenA, name receiver, extended_asset assetInput, std::string memo);
  void _buyRamAndAddOracleRow(uint64_t poolId, name payer, asset quantity);
  uint64_t _consumed_counter(name counter_name);
  std::tuple<int64_t, uint128_t, uint32_t> _snapshotCumulativesInside(const PoolS& poolInfo, int32_t tickLower,
                                                                      int32_t tickUpper);
  std::tuple<std::vector<int64_t>, std::vector<uint128_t>> _observe(const PoolS& poolInfo,
                                                                    std::vector<uint32_t> secondsAgos);
  void _addIncenticeTokenReward(uint64_t incentiveId, extended_asset inToken, name owner);
  void _activeIncentive(extended_asset inToken);
  uint64_t _get_next_incentive_id();
  void _updateStakingWeight(const PoolS& poolInfo, const Position::PositionS& posInfo, bool isMint);
  std::tuple<uint64_t, uint128_t> _computeRewardAmount(uint64_t totalRewardUnclaimed, uint128_t totalSecondsClaimedX64,
                                                       uint32_t startTime, uint32_t endTime, uint64_t liquidity,
                                                       uint128_t secondsPerLiquidityInsideLastX64,
                                                       uint128_t secondsPerLiquidityInsideX64, uint32_t currentTime);
  uint32_t _lastTimeRewardApplicable(uint32_t periodFinish);
  uint128_t _rewardPerToken(const IncentiveS& incentive);
  uint64_t _earned(const IncentiveS& incentive, const StakeS& stakedAccount);
  std::tuple<uint64_t, uint128_t> _updateReward(uint64_t incentiveId, name account, const StakeS& stakedAccount);
  void _addStakingPosition(uint64_t posId, uint64_t incentiveId, name owner, name ram_payer);
  void _removeStakingPosition(uint64_t posId, uint64_t incentiveId);
  void _disable_staking();
  bool _isPosStaking(uint64_t posId);
  std::tuple<int64_t, int64_t> _calculateAmountFromPosition(const PoolS& poolInfo, int32_t tickLower, int32_t tickUpper,
                                                            int64_t liquidityDelta);
  uint64_t _convertAmountToStakingWeight(uint64_t amountA, uint64_t amountB);
  bool _isAccountBanned(name account);
  std::tuple<bool, bool, bool> _getFozenPool(uint64_t poolId);
};
#endif  // INCLUDE_ALCORSWAP_HPP_"
