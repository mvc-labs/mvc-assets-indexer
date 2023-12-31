
# mvc-assets-indexer

The index service for P2PKH and MetaContract Fungible Token (FT) assets on [MicroVisionChain](https://www.microvisionchain.com/).

It is an open-sourced data service that everyone can run and deploy. There are several basic APIs of this indexer:

- broadcast transaction
- query P2PKH UTXO and balance by an address
- query FT UTXO and balance by an address

<img src="https://github.com/mvc-labs/mvc-assets-indexer/assets/126772024/b455cab4-8a86-4c09-a633-13b7518774b7" width="500">

With this service, developers can build their own apps associated with assets on MicroVisionChain, sending and receiving them, etc.

You can run your own service, or use our public deployments of this indexer directly.

- mainnet: https://mvcapi.cyber3.space
- testnet: https://mvcapi-testnet.cyber3.space

We have also built a [CLI](https://github.com/mvc-labs/mvc-cli) wallet that can work with this indexer, helping you send and receive SPACE and Tokens.

## Deployment

- [simple deploy](./docs/deploy-simple.md)
- [advanced deploy](./docs/deploy-advanced.md)

## Installation

```bash
npm install
```

## Running the app

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```
