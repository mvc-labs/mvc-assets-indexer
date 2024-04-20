import * as mvc from 'mvc-lib';
import axios from 'axios';
import { signMessage } from '../lib/hash';

const getNodeInfo = async (host: string) => {
  const url = `${host}/admin/info`;
  return (await axios.get(url)).data;
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

const updateAdminPub = async (host: string, data: any) => {
  const body = JSON.stringify(data);
  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${host}/admin/updateAdminPub`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
  };
  return (await axios.request(config)).data;
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

const main = async function () {
  // set INDEXER_HOST
  // set INDEXER_ADMIN_WIF
  const host = process.env.INDEXER_HOST;
  const privateKey = mvc.PrivateKey(process.env.INDEXER_ADMIN_WIF);
  const pubkey = privateKey.publicKey.toString();
  console.log('pubkey', pubkey);
  {
    // init admin
    const nodeInfo: {
      data: { status: string; inGroup: boolean; adminPub: string };
    } = await getNodeInfo(host);
    console.log('nodeInfo', host, nodeInfo);
    if (nodeInfo.data.status === 'Uninitialized') {
      // demo init admin
      const sig = signMessage(privateKey, pubkey);
      const commitInfo = await commitInit(host, pubkey, sig);
      console.log(commitInfo);
    } else {
      // demo update admin
      const newPrivateKey = privateKey;
      const newPubkey = pubkey;
      const newAdminSig = signMessage(newPrivateKey, newPubkey);
      const data = {
        newPubkey: newPubkey,
        newAdminSig: newAdminSig,
      };
      const sig = signMessage(privateKey, JSON.stringify(data));
      const body = {
        sig,
        data: data,
      };
      const resp = await updateAdminPub(host, body);
      console.log('admin update', resp);
    }
  }
  {
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
  }
  {
    // add auth pubkey
  }
  {
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
  }
};

main().then();
