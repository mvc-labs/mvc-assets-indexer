import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { ObjLoader } from '../../lib/objLoader';
import axios, { Method } from 'axios';
import * as http from 'http';
import * as https from 'https';

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

@Injectable()
export class RpcService {
  private readonly rpcHost: string;
  private readonly rpcExtHost: string;
  private readonly rpcPort: string;
  private readonly rpcExtPort: string;
  private readonly rpcUser: string;
  private readonly rpcPassword: string;
  private readonly rpcUrl: string;
  private readonly headers: any;
  private objLoader: ObjLoader;

  constructor(private configService: ConfigService) {
    this.rpcHost = this.configService.get('rpcHost');
    this.rpcExtHost = this.configService.get('rpcExtHost');
    this.rpcPort = this.configService.get('rpcPort');
    this.rpcExtPort = this.configService.get('rpcExtPort');
    this.rpcUser = this.configService.get('rpcUser');
    this.rpcPassword = this.configService.get('rpcPassword');
    this.rpcUrl = `http://${this.rpcHost}:${this.rpcPort}`;
    this.objLoader = new ObjLoader(
      this.rpcExtHost,
      Number(this.rpcExtPort),
      this.rpcUser,
      this.rpcPassword,
    );
    this.headers = {
      'Content-Type': 'text/plain',
      Authorization:
        'Basic ' +
        Buffer.from(this.rpcUser + ':' + this.rpcPassword).toString('base64'),
    };
  }

  private async callRpc(data: any) {
    try {
      const method: Method = 'POST';
      const config = {
        method: method,
        maxBodyLength: Infinity,
        url: this.rpcUrl,
        headers: this.headers,
        data: data,
        httpAgent: httpAgent,
        httpsAgent: httpsAgent,
      };
      return await axios.request(config);
    } catch (e) {
      console.log('callRpc e', e);
    }
  }

  private async callRpcRaise(data: any) {
    const method: Method = 'POST';
    const config = {
      method: method,
      maxBodyLength: Infinity,
      url: this.rpcUrl,
      headers: this.headers,
      data: data,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
    };
    return await axios.request(config);
  }

  public async getBlockChainInfo(): Promise<AxiosResponse<any> | undefined> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'getblockchaininfo',
    };
    return this.callRpc(rpcData);
  }

  public async getRawMempool(): Promise<AxiosResponse<any> | undefined> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'getrawmempool',
    };
    return this.callRpc(rpcData);
  }

  public async getMempoolInfo(): Promise<AxiosResponse<any> | undefined> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'getmempoolinfo',
    };
    return this.callRpc(rpcData);
  }

  public async pushTx(txHex: string): Promise<AxiosResponse<any> | undefined> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'sendrawtransaction',
      params: [txHex],
    };
    return this.callRpcRaise(rpcData);
  }

  public async getBlockHeader(
    blockHash: any,
  ): Promise<AxiosResponse<any> | undefined> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'getblockheader',
      params: [blockHash],
    };
    return this.callRpc(rpcData);
  }

  public async getBestBlockHash(): Promise<AxiosResponse<any> | undefined> {
    const now = Date.now();
    const rpcData = {
      jsonrpc: '1.0',
      id: now,
      method: 'getbestblockhash',
      params: [],
    };
    return this.callRpc(rpcData);
  }

  public async getRawTxByRest(
    txid: string,
  ): Promise<AxiosResponse<any> | undefined> {
    const url = `${this.rpcUrl}/rest/tx/${txid}.hex`;
    try {
      return await axios.get(url, {
        httpAgent: httpAgent,
        httpsAgent: httpsAgent,
      });
    } catch (e) {
      console.log('getRawTxByRest e', e);
    }
  }

  public async getRawBlockByRest(
    blockHash: string,
    path: string,
  ): Promise<boolean> {
    try {
      await this.objLoader.downloadToFile(blockHash, path);
      return true;
    } catch (e) {
      return false;
    }
  }
}
