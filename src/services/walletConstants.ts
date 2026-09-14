import { Chains } from '@wharfkit/common';

export const APP_NAME = 'Flex Forex: Token Launcher';
/** Valid 1-12 char eosio name. `flex.launcher` is 13 chars and WebAuth rejects it. */
export const REQUEST_ACCOUNT = 'flexlaunch';

/** XPR Network mainnet - same definition WharfKit ships as Chains.XPR */
export const XPR_CHAIN = Chains.XPR;
export const XPR_CHAIN_ID_HEX = String(XPR_CHAIN.id);

export const CHAIN_ENDPOINTS = [
  'https://proton.greymass.com',
  'https://proton.eosusa.io',
  'https://proton.cryptolions.io',
];

/** Shown in the wallet selector modal (resolved against site origin). */
export const APP_LOGO = '/placeholder.svg';
