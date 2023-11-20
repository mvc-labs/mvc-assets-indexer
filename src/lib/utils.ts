const coinBaseInputTxid =
  '0000000000000000000000000000000000000000000000000000000000000000';

export function isCoinBase(prevTxId: string) {
  return prevTxId === coinBaseInputTxid;
}

export function trimEmptyBytes(str: string) {
  if (str) {
    const index = str.indexOf('\x00');
    return str.slice(0, index);
  } else {
    return '';
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const arrayToChunks = (rawArray: string | any[], size: number) => {
  const chunks = [];
  for (let i = 0; i < rawArray.length; i += size) {
    const chunk = rawArray.slice(i, i + size);
    chunks.push(chunk);
  }
  return chunks;
};

export function mergeFtBalance(records: any) {
  const cache = {};
  for (const record of records) {
    const key = `${record.codeHash}-${record.genesis}`;
    if (!cache[key]) {
      cache[key] = {
        codeHash: record.codeHash,
        genesis: record.genesis,
        name: record.name,
        symbol: record.symbol,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        decimal: record.decimal,
        sensibleId: record.sensibleId,
        utxoCount: record.utxoCount,
        confirmed: 0,
        confirmedString: '0',
        unconfirmed: 0,
        unconfirmedString: '0',
      };
    }
    if (record.is_confirm === 'confirmed') {
      cache[key].confirmed = Number(record.balance);
      cache[key].confirmedString = record.balance;
    } else {
      cache[key].unconfirmed = Number(record.balance);
      cache[key].unconfirmedString = record.balance;
    }
  }
  return Object.values(cache);
}

export const sortedObjectArrayByKey = (lst: any[], key: string) => {
  const lstStore = {};
  const newLst = [];
  const keyValue = lst.map((value) => {
    lstStore[value[key]] = value;
    return value[key];
  });
  const keyValueSorted = keyValue.sort();
  for (const keyValueSortedElement of keyValueSorted) {
    const value = lstStore[keyValueSortedElement];
    newLst.push(value);
  }
  return newLst;
};
