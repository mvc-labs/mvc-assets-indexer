import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import { Context } from 'koa';

const callback = (context: Context) => {
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
  console.log(`Mock server is up and running on port ${port}`);
};

main().then();
