import { FLEXFOREX_CONTRACT, EASYFLEX_CONTRACT, COMPLEXFLEX_CONTRACT, MON3Y, SWAP_ALCOR } from "@/config/launch";
import { getAbi, getAccount, getInfo } from "@/services/rpc";

export type ChainStatus = {
  chainId: string;
  lockpos: boolean;
  mon3y: boolean;
  contracts: { easyflex: boolean; complexflex: boolean; flexforex: boolean; swap: boolean };
};

export async function readChainStatus(): Promise<ChainStatus> {
  const [info, abi, mon3y, easy, complex, forex, swap] = await Promise.all([
    getInfo(),
    getAbi(SWAP_ALCOR).catch(() => null),
    getAccount(MON3Y).then((a) => Boolean(a.account_name)).catch(() => false),
    getAccount(EASYFLEX_CONTRACT).then((a) => Boolean(a.account_name)).catch(() => false),
    getAccount(COMPLEXFLEX_CONTRACT).then((a) => Boolean(a.account_name)).catch(() => false),
    getAccount(FLEXFOREX_CONTRACT).then((a) => Boolean(a.account_name)).catch(() => false),
    getAccount(SWAP_ALCOR).then((a) => Boolean(a.account_name)).catch(() => false),
  ]);
  const actions = abi?.actions?.map((a) => a.name) ?? [];
  return {
    chainId: info.chain_id ?? "",
    lockpos: actions.includes("lockpos"),
    mon3y,
    contracts: { easyflex: easy, complexflex: complex, flexforex: forex, swap },
  };
}

export async function swapHasLockpos(): Promise<boolean> {
  const abi = await getAbi(SWAP_ALCOR);
  return (abi.actions ?? []).some((a) => a.name === "lockpos");
}
