export let network: 'mainnet' | 'testnet' = process.env.NET as unknown as any;

if (!network) {
  network = 'mainnet';
}

export const GlobalConfigKey = {
  adminPub: 'adminPub',
  callbackUrl: 'callbackUrl',
};
