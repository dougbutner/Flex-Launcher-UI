import { Chains } from '@wharfkit/common';

export const APP_NAME = 'XPR Network game template';
export const REQUEST_ACCOUNT = 'xpr.template';
/** Multiple RPC endpoints for fault tolerance (XPR Network mainnet). */
export const CHAIN_ENDPOINTS = [
  'https://proton.greymass.com',
  'https://proton.eosusa.io',
];
/** Shown in the wallet selector modal (resolved against site origin). */
export const APP_LOGO = '/placeholder.svg';

/** XPR Network mainnet — same definition WharfKit ships in @wharfkit/common */
export const XPR_CHAIN = Chains.XPR;

export const XPR_CHAIN_ID_HEX = String(XPR_CHAIN.id);
