import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import { Context } from 'koa';

const callback = (context: Context) => {
  const body: { txid: string } = context.request.body as unknown as any;
  /*
  Todo
  1. get tx raw from rpc
  2. parse tx get address and utxo type
      if p2pkh
        pass
      else if ft
        check token
  3. do logic
  4. response json { "success": true }
  */
  context.body = {
    success: true,
  };
  console.log('body:', body);
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
  console.log(`Koa application is up and running on port ${port}`);
};

main().then();
