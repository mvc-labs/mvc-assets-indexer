import * as Koa from 'koa';
import { Context } from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import { NodeRpcClient } from './node-rpc';
import { mvc, OutputType, TxDecoder } from 'meta-contract';
import { ftOutpointCheck } from './ft';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

const { RPC_HOST, RPC_PORT, RPC_USER, RPC_PASSWORD } = process.env;

const ftList = [
  {
    name: 'msp',
    genesis: 'b2d75931958114e48c9927160f80363eae78e2dc',
    decimal: '1e8',
    codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
  },
  {
    name: 'usdt',
    genesis: '94c2ae3fdbf95a4fb0d788c818cf5fcc7a9aa66a',
    decimal: '1e8',
    codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
  },
  {
    name: 'show',
    genesis: '185b4c8fb97a133f1587411b449d30d87ce7d155',
    decimal: '1e8',
    codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
  },
  {
    name: 'mc',
    genesis: '07e4c5a9f866164108de005be81d40ccbd2e964c',
    decimal: '1e8',
    codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
  },
  {
    name: 'vemsp',
    genesis: 'fad7b10812fa76718127e084bb71cdb87853261c',
    decimal: '1e8',
    codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
  },
];

const ftMap = {};

ftList.map((value) => (ftMap[value.codehash + value.genesis] = value));

const nodeRpcClient = new NodeRpcClient(
  RPC_HOST,
  parseInt(RPC_PORT),
  RPC_USER,
  RPC_PASSWORD,
);

const callback = async (context: Context) => {
  const body: { txid: string; confirmed: boolean } = context.request
    .body as unknown as any;
  /*
  Todo
  1. get tx raw from rpc
  2. parse tx get address and utxo type
      if type = p2pkh
        do logic
      else if type = ft
        check token is fake
        if token is true
          do logic
        else
          pass
      else:
        pass
  3. final response json { "success": true }
  */
  console.log('body:', body);
  const { txid } = body;
  // 1.
  const txHex = await nodeRpcClient.getRawTransaction(body.txid);
  // 2.
  const tx = new mvc.Transaction(txHex);
  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const outputInfo = TxDecoder.decodeOutput(output, null);
    if (outputInfo.type === OutputType.P2PKH) {
      // if address in db, save txid, waiting confirm, then do logic
      console.log(
        `${txid} receive space:`,
        outputInfo.address,
        outputInfo.satoshis,
      );
    } else if (outputInfo.type === OutputType.SENSIBLE_FT) {
      // if address and codehash + genesis in db, check output
      const key = outputInfo.data.codehash + outputInfo.data.genesis;
      if (ftMap[key]) {
        const ft = ftMap[key];
        const isPassCheck = await ftOutpointCheck(
          nodeRpcClient,
          ft.genesis,
          tx,
          i,
        );
        if (isPassCheck) {
          // save txid, waiting confirm, then do logic
          console.log(
            `${txid} receive ${ft.name}:`,
            outputInfo.data.tokenAddress,
            outputInfo.data.tokenAmount.toString(),
            ', isPassCheck: ',
            isPassCheck,
          );
        }
      }
    }
  }
  // 3
  context.body = {
    success: true,
  };
};

const AppRoutes = [
  {
    path: '/callback',
    method: 'post',
    action: callback,
  },
];

const main = async () => {
  // create koa app
  const app = new Koa();
  const router = new Router();
  // register all application routes
  AppRoutes.forEach((route) => router[route.method](route.path, route.action));
  // run app
  app.use(bodyParser());
  app.use(router.routes());
  app.use(router.allowedMethods());
  const port = parseInt(process.env.PORT || '15001');
  app.listen(port);
  console.log(`Mock server is up and running on port ${port},`);
  console.log(`Exchange deposit systems can refer to this code.`);
};

main().then();
