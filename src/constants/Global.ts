import { Network, networks } from 'bitcoinjs-lib';
export let network: 'mainnet' | 'testnet' = process.env.NET as unknown as any;

if (!network) {
  network = 'mainnet';
}

export let networkObj: Network = networks.bitcoin;

if (network === 'testnet') {
  networkObj = networks.testnet;
}

export const GlobalConfigKey = {
  adminPub: 'adminPub',
};
