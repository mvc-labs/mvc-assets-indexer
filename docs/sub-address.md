# How to subscribe address tx

The index service has a subscription address feature, which is described below to use this feature.


## Step 1. Initialize the administrator

- update new admin key
- set auth pubkey
- set subscription pubkey

[demo script](./../src/scripts/admin.ts)

```typescript
import * as mvc from 'mvc-lib';
import { ec as EC } from 'elliptic';
import axios from 'axios';

const ec = new EC('secp256k1');

function sha256(message: string) {
  return Buffer.from(mvc.crypto.Hash.sha256(Buffer.from(message)), 'hex');
}

const signMessage = (pk, message: string) => {
  const key = ec.keyFromPrivate(pk.bn.toString('hex'));
  return key.sign(sha256(message)).toDER('hex');
};

const commitInit = async (host: string, pubkey: string, sig: string) => {
  const data = {
    pubkey,
    sig,
  };
  const body = JSON.stringify(data);
  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${host}/admin/commitInit`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
  };
  return (await axios.request(config)).data;
};

const main = async () => {
  const host = process.env.INDEXER_HOST;
  const privateKey = new mvc.PrivateKey(process.env.INDEXER_ADMIN_WIF);
  const pubkey = privateKey.publicKey.toString();
  const sig = signMessage(privateKey, pubkey);
  const commitInfo = await commitInit(host, pubkey, sig);
  console.log('commitInfo:', commitInfo);
};

main().then();
```


## Step 2. Set callback url

callback url is one post api, if discover a new txid, will post this api data, this api need response {"success": true}, If there is no correct response, the service retries until it receives the correct response

```typescript
import * as mvc from 'mvc-lib';
import { ec as EC } from 'elliptic';
import axios from 'axios';

const ec = new EC('secp256k1');

function sha256(message: string) {
  return Buffer.from(mvc.crypto.Hash.sha256(Buffer.from(message)), 'hex');
}

const signMessage = (pk, message: string) => {
  const key = ec.keyFromPrivate(pk.bn.toString('hex'));
  return key.sign(sha256(message)).toDER('hex');
};

const updateConfig = async (host: string, data: any) => {
  const body = JSON.stringify(data);
  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${host}/admin/updateConfig`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
  };
  return (await axios.request(config)).data;
};

const main = async () => {
  const host = process.env.INDEXER_HOST;
  const privateKey = new mvc.PrivateKey(process.env.INDEXER_ADMIN_WIF);
  // set callback url
  const data = {
    key: 'callbackUrl',
    value: 'http://127.0.0.1:15001/callback',
  };
  const sig = signMessage(privateKey, JSON.stringify(data));
  const body = {
    sig,
    data: data,
  };
  const resp = await updateConfig(host, body);
  console.log('updateConfig:', resp);
};

main().then();
```

### unconfirmed 
```json
{
  "txid": "9e167e183ca22e81f8a21623a805d0554f620ddea626260e115a34b715aafd67",
  "confirmed": false
}
```

### confirmed
```json
{
  "txid": "9e167e183ca22e81f8a21623a805d0554f620ddea626260e115a34b715aafd67",
  "confirmed": true
}
```

## Step 3. Set an auth key

auth key can set subscription pubkey for service, if service want subscription a new pubkey, use auth key to set subscription pubkey

```typescript
import * as mvc from 'mvc-lib';
import { ec as EC } from 'elliptic';
import axios from 'axios';

const ec = new EC('secp256k1');

function sha256(message: string) {
  return Buffer.from(mvc.crypto.Hash.sha256(Buffer.from(message)), 'hex');
}

const signMessage = (pk, message: string) => {
  const key = ec.keyFromPrivate(pk.bn.toString('hex'));
  return key.sign(sha256(message)).toDER('hex');
};

const addAuthPubkey = async (host: string, data: any) => {
  const body = JSON.stringify(data);
  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${host}/admin/addAuthPubkey`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
  };
  return (await axios.request(config)).data;
};

const main = async () => {
  const host = process.env.INDEXER_HOST;
  const privateKey = new mvc.PrivateKey(process.env.INDEXER_ADMIN_WIF);
  const pubkey = privateKey.publicKey.toString();
  // add auth pubkey
  // demo address is random
  const authPubkey =
    '0277130230821766ee72f50dcaa3d68bba99d20a700b6747879f904c232000684a';
  const dto = {
    notifyPubkey: authPubkey,
    publicKey: pubkey,
    publicKeySign: signMessage(privateKey, authPubkey),
  };
  const resp = await addAuthPubkey(host, dto);
  console.log('authPubkey resp:', resp);
};

main().then();
```

## Step 4. Set a listen key

```typescript
import * as mvc from 'mvc-lib';
import { ec as EC } from 'elliptic';
import axios from 'axios';

const ec = new EC('secp256k1');

function sha256(message: string) {
  return Buffer.from(mvc.crypto.Hash.sha256(Buffer.from(message)), 'hex');
}

const signMessage = (pk, message: string) => {
  const key = ec.keyFromPrivate(pk.bn.toString('hex'));
  return key.sign(sha256(message)).toDER('hex');
};

const addListenPubkey = async (host: string, data: any) => {
  const body = JSON.stringify(data);
  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${host}/admin/addListenPubkey`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
  };
  return (await axios.request(config)).data;
};

const main = async () => {
  const host = process.env.INDEXER_HOST;
  const privateKey = new mvc.PrivateKey(process.env.SERVICE_AUTH_WIF);
  const pubkey = privateKey.publicKey.toString();
  // add listen pubkey
  // demo address is f2 pool miner
  const listenPubkey =
    '025dc17b4f5ac34e0c3e179c04df18eab375312f762a12eb15e6188e46e584b26c';
  const dto = {
    notifyPubkey: listenPubkey,
    publicKey: pubkey,
    publicKeySign: signMessage(privateKey, listenPubkey),
  };
  const resp = await addListenPubkey(host, dto);
  console.log('addListenPubkey resp:', resp);
};

main().then();
```

## How to implement one callback api

[mock server script](./../src/scripts/mockServer.ts)
