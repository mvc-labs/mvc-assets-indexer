import * as mvc from 'mvc-lib';

const genesisMerkleRoot = Buffer.from(
  'da2b9eb7e8a3619734a17b55c47bdd6fd855b0afa9c7e14e3a164a279e51bba9',
  'hex',
).reverse();

const genesisTrueMerkleRoot = Buffer.from(
  '921c9ad4264610101e46b4e67b7c030fbcc4ca9633bbd40b3079a62cf3ef531d',
  'hex',
).reverse();

const _hashMerkleNode = function (a: Buffer, b: Buffer) {
  return mvc.crypto.Hash.sha256(
    mvc.crypto.Hash.sha256(Buffer.concat([a, b] as any)),
  );
};

const _merkle = function (txidBufferList: Buffer[]) {
  if (txidBufferList.length === 1) {
    return txidBufferList[0];
  }
  const newTxidBufferList = [];
  for (let i = 0; i < txidBufferList.length - 1; i += 2) {
    newTxidBufferList.push(
      _hashMerkleNode(txidBufferList[i], txidBufferList[i + 1]),
    );
  }
  if (txidBufferList.length % 2 === 1) {
    newTxidBufferList.push(
      _hashMerkleNode(
        txidBufferList[txidBufferList.length - 1],
        txidBufferList[txidBufferList.length - 1],
      ),
    );
  }
  return _merkle(newTxidBufferList);
};

export const merkle = function (txidList: string[]) {
  const txidBufferList = txidList.map((value: string) => {
    return Buffer.from(value, 'hex').reverse();
  });
  return _merkle(txidBufferList);
};

export const verifyMerkle = function (block: any) {
  try {
    const txIdList = block.transactions.map(function (value: any) {
      return value.hash;
    });
    const fileMerkleRoot = merkle(txIdList);
    if (genesisMerkleRoot.equals(block.header.merkleRoot)) {
      return fileMerkleRoot.equals(genesisTrueMerkleRoot);
    } else {
      return fileMerkleRoot.equals(block.header.merkleRoot);
    }
  } catch (e) {}
  return false;
};
