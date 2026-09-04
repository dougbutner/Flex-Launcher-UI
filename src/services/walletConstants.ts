import { Chains } from '@wharfkit/common';

export const APP_NAME = 'Flex Launcher';
export const REQUEST_ACCOUNT = 'flex.launcher';

/** XPR Network testnet — same definition WharfKit ships as Chains.XPRTestnet */
export const XPR_CHAIN = Chains.XPRTestnet;
export const XPR_CHAIN_ID_HEX = String(XPR_CHAIN.id);

export const CHAIN_ENDPOINTS = [
  'https://proton-testnet.greymass.com',
  'https://proton-testnet.cryptolions.io',
  'https://test.proton.eosusa.io',
];

/** Shown in the wallet selector modal (resolved against site origin). */
export const APP_LOGO = '/placeholder.svg';
