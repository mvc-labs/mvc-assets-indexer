import { NodeRpcClient } from './node-rpc';
import { mvc } from 'meta-contract';
import { ftOutpointCheck } from './ft';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

const main = async () => {
  const { RPC_HOST, RPC_PORT, RPC_USER, RPC_PASSWORD } = process.env;
  const nodeRpcClient = new NodeRpcClient(
    RPC_HOST,
    parseInt(RPC_PORT),
    RPC_USER,
    RPC_PASSWORD,
  );
  const testCaseList = [
    // msp transfer
    {
      txid: 'ac8096668b98fef6e8ad9ef18de403606f74a48c782875bedc97063b1f8960ad',
      codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
      genesis: 'b2d75931958114e48c9927160f80363eae78e2dc',
      outputIndex: 1,
      expected: true,
    },
    // Wrapped𝛑 mint
    {
      txid: '3e5cb6a71b535dfe6499504e0b72d8ac66ccd4639385aff52cf98cb6fe8c613f',
      codehash: 'c9cc7bbd1010b44873959a8b1a2bcedeb62302b7',
      genesis: '60ee8716fb3feed64459ff8fbf62661f96f7a1c4',
      outputIndex: 1,
      expected: true,
    },
    // fake msp token
    {
      txid: '04dbc407966e2e630884d010aa736844aef3c4e6cc92d39c5b5150f1379ea401',
      codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
      genesis: 'b2d75931958114e48c9927160f80363eae78e2dc',
      outputIndex: 0,
      expected: false,
    },
    // fake show token
    {
      txid: '04dbc407966e2e630884d010aa736844aef3c4e6cc92d39c5b5150f1379ea401',
      codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
      genesis: '185b4c8fb97a133f1587411b449d30d87ce7d155',
      outputIndex: 1,
      expected: false,
    },
  ];
  for (const testCase of testCaseList) {
    const { txid, genesis, outputIndex, expected } = testCase;
    const txHex = await nodeRpcClient.getRawTransaction(txid);
    const tx = new mvc.Transaction(txHex);
    const isPassCheck = await ftOutpointCheck(
      nodeRpcClient,
      genesis,
      tx,
      outputIndex,
    );
    console.log(
      'isPassCheck:',
      isPassCheck,
      'test case pass:',
      isPassCheck === expected,
    );
  }
};

main().then();
