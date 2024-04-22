import { mvc } from 'meta-contract';
import { toHex } from 'mvc-scrypt';
import { getLockingScriptFromPreimage } from 'meta-contract/dist/common/tokenUtil';
import {
  getQueryGenesis,
  parseDataPart,
  updateScript,
} from 'meta-contract/dist/mcp02/contract-proto/token.proto';
import { NodeRpcClient } from './node-rpc';

async function findAsync(arr: any, asyncCallback: any) {
  const promises = arr.map(asyncCallback);
  const results = await Promise.all(promises);
  const index = results.findIndex((result) => result);
  return arr[index];
}

const checkPreLockingScript = async (
  api: NodeRpcClient,
  input: mvc.Transaction.Input,
  lockingScriptBuf: any,
) => {
  const preTxId = input.prevTxId.toString('hex');
  const preOutputIndex = input.outputIndex;
  const preTxHex = await api.getRawTransaction(preTxId);
  const preTx = new mvc.Transaction(preTxHex);
  const preOutput = preTx.outputs[preOutputIndex].script.toBuffer();
  return preOutput.toString('hex') === lockingScriptBuf.toString('hex');
};

export const ftOutpointCheck = async (
  api: NodeRpcClient,
  genesis: string,
  tx: mvc.Transaction,
  outputIndex: number,
) => {
  const tokenScript = tx.outputs[outputIndex].script;
  const curDataPartObj = parseDataPart(tokenScript.toBuffer());
  const input = await findAsync(
    tx.inputs,
    async (input: mvc.Transaction.Input) => {
      const script = new mvc.Script(input.script);
      if (script.chunks.length > 0) {
        const lockingScriptBuf = getLockingScriptFromPreimage(
          script.chunks[0].buf,
        );
        if (lockingScriptBuf) {
          if (getQueryGenesis(lockingScriptBuf) == genesis) {
            // check pre script
            return checkPreLockingScript(api, input, lockingScriptBuf);
          }
          const dataPartObj = parseDataPart(lockingScriptBuf);
          dataPartObj.sensibleID = curDataPartObj.sensibleID;
          const newScriptBuf = updateScript(lockingScriptBuf, dataPartObj);
          const genesisHash = toHex(
            mvc.crypto.Hash.sha256ripemd160(newScriptBuf),
          );
          if (genesisHash == curDataPartObj.genesisHash) {
            // check pre script
            return checkPreLockingScript(api, input, lockingScriptBuf);
          }
        }
      }
    },
  );
  return !!input;
};
