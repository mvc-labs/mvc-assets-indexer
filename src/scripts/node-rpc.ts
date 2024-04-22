import axios, { Method } from 'axios';

export class NodeRpcClient {
  private readonly rpcHost: string;
  private readonly rpcPort: number;
  private readonly rpcUser: string;
  private readonly rpcPassword: string;
  private readonly rpcUrl: string;
  private readonly headers: { Authorization: string; 'Content-Type': string };
  constructor(
    rpcHost: string,
    rpcPort: number,
    rpcUser: string,
    rpcPassword: string,
  ) {
    this.rpcHost = rpcHost;
    this.rpcPort = rpcPort;
    this.rpcUser = rpcUser;
    this.rpcPassword = rpcPassword;
    this.rpcUrl = `http://${this.rpcHost}:${this.rpcPort}`;
    this.headers = {
      'Content-Type': 'text/plain',
      Authorization:
        'Basic ' +
        Buffer.from(this.rpcUser + ':' + this.rpcPassword).toString('base64'),
    };
  }

  private async callRpc(data: any) {
    const method: Method = 'POST';
    const config = {
      method: method,
      maxBodyLength: Infinity,
      url: this.rpcUrl,
      headers: this.headers,
      data: data,
    };
    return await axios.request(config);
  }

  public async getRawTransaction(
    txid: string,
    verbose: number = 0,
  ): Promise<string | any> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'getrawtransaction',
      params: [txid, verbose],
    };
    return (await this.callRpc(rpcData)).data.result;
  }
}
