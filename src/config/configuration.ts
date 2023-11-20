// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
const getEnvTruthy = (key: string) => {
  const value = process.env[key];
  return (
    value === 'true' || value === 'True' || value === 'TRUE' || value === '1'
  );
};

export default () => ({
  rpcHost: process.env.RPC_HOST,
  rpcExtHost: process.env.RPC_EXT_HOST,
  rpcPort: process.env.RPC_PORT,
  rpcExtPort: process.env.RPC_EXT_PORT,
  rpcUser: process.env.RPC_USER,
  rpcPassword: process.env.RPC_PASSWORD,
  blockTimeMS: process.env.BLOCK_TIME_MS,
  blockProcessMS: process.env.BLOCK_PROCESS_MS,
  txProcessMS: process.env.TX_PROCESS_MS,
  blockDownloadMS: process.env.BLOCK_DOWNLOAD_MS,
  blockCacheNumber: process.env.BLOCK_CACHE_NUMBER,
  zmqServer: process.env.ZMQ_SERVER,
  blockCacheFolder: process.env.BLOCK_CACHE_FOLDER,
  blockDbFile: process.env.BLOCK_DB_FILE,
  txDbFile: process.env.TX_DB_FILE,
  zmqSubEventList: ['rawtx', 'hashblock'],
  zmqDebug: true,
  debug: getEnvTruthy('DEBUG'),
});
