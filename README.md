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

## Benchmark

### Database

- Operating System: Ubuntu 20.04
- CPU: 2 cores
- RAM: 8GB;
- MySQL version: 8.0.22
- mysql cnf

```
# Default Homebrew MySQL server config
[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
mysqlx-bind-address = 127.0.0.1
innodb_buffer_pool_instances = 4
innodb_buffer_pool_size = 4G
innodb_buffer_pool_chunk_size = 1G
innodb_read_io_threads = 8
innodb_parallel_read_threads = 16
innodb_write_io_threads = 8
```
### Server

- Operating System: Ubuntu 20.04
- CPU: 2 cores
- RAM: 8GB;
- NODE_OPTIONS="--max-old-space-size=4096"

### Performance

| Tx numbers | Block numbers | Block per tx | Index time (s) |  Tps   |
|:----------:|:-------------:|:------------:|:--------------:|:------:|
|  6242999   |     68397     |     91.3     |     26028      | 239.86 |


## Changelog

### v1.4.9 (2024-04-22)

- Added
  - [subscribe address tx](./docs/sub-address.md)

### v1.4.8 (2024-02-27)

- Added
  - block sync progress log
  - indexer ready progress log
- Changed
  - optimize block sync logic, 59476 block sync time is about 5 hours.
  - optimize database table index, 80% reduction in database pressure.
