import * as mvc from 'mvc-lib';
import { ec as EC } from 'elliptic';
import { Buffer } from 'node:buffer';
const ec = new EC('secp256k1');

export function sha256(message: string): Buffer {
  return Buffer.from(mvc.crypto.Hash.sha256(Buffer.from(message)), 'hex');
}

export function hash160(scriptCodeBuf: string) {
  return mvc.crypto.Hash.sha256ripemd160(Buffer.from(scriptCodeBuf, 'hex'));
}

export const signMessage = (pk, message: string) => {
  const key = ec.keyFromPrivate(pk.bn.toString('hex'));
  return key.sign(sha256(message)).toDER('hex');
};

export function verifyWithPubKey(
  message: string,
  sig: string,
  pubkey: string,
): boolean {
  const key = ec.keyFromPublic(pubkey, 'hex');
  return key.verify(sha256(message), sig);
}
