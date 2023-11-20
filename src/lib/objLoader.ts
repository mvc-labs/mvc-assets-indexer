import * as fs from 'fs';
import axios, { Method, ResponseType } from 'axios';
import { PromisePool } from '@supercharge/promise-pool';
import * as http from 'http';
import * as https from 'https';

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

export class ObjLoader {
  private readonly headers: { Authorization: string };
  private readonly rpcUrl: string;
  constructor(
    rpcHost: string,
    rpcPort: number,
    rpcUser: string,
    rpcPassword: string,
  ) {
    this.rpcUrl = `http://${rpcHost}:${rpcPort}`;
    this.headers = {
      Authorization:
        'Basic ' + Buffer.from(rpcUser + ':' + rpcPassword).toString('base64'),
    };
  }

  static createEmptyFileOfSize = (filename: string, size: number) => {
    return new Promise((resolve) => {
      let fh = fs.openSync(filename, 'w');
      fs.writeSync(fh, 'ok', Math.max(0, size - 2));
      fs.closeSync(fh);
      resolve(true);
    });
  };

  async getObjInfo(q: string) {
    const url = `${this.rpcUrl}/obj/info?q=${q}`;
    const method: Method = 'GET';
    const config = {
      method: method,
      maxBodyLength: Infinity,
      url: url,
      headers: this.headers,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
    };
    return await axios.request(config);
  }

  async getObjChunk(q: string, chunkIndex: number, chunkSize: number) {
    const url = `${this.rpcUrl}/obj/chunk?q=${q}&chunk_index=${chunkIndex}&chunk_size=${chunkSize}`;
    const method: Method = 'GET';
    const responseType: ResponseType = 'arraybuffer';
    const config = {
      method: method,
      maxBodyLength: Infinity,
      responseType: responseType,
      url: url,
      headers: this.headers,
    };
    return await axios.request(config);
  }

  async downloadToFile(
    q: string,
    filename: string,
    chunkSize: number = 750000,
  ) {
    // alloc file
    const info = await this.getObjInfo(q);
    const size = info.data.size;
    await ObjLoader.createEmptyFileOfSize(filename, size);
    // concurrent download chunks save to file
    const taskNumber = size / chunkSize;
    const taskList = [];
    for (let i = 0; i < taskNumber; i++) {
      const task = {
        chunk_index: i,
        chunk_size: chunkSize,
      };
      taskList.push(task);
    }
    const handler = await fs.promises.open(filename, 'w');
    try {
      const { errors } = await PromisePool.withConcurrency(3)
        .for(taskList)
        .process(async (task) => {
          try {
            const data = await this.getObjChunk(
              q,
              task.chunk_index,
              task.chunk_size,
            );
            await handler.write(
              data.data,
              0,
              data.data.length,
              task.chunk_index * task.chunk_size,
            );
          } catch (e) {
            console.log('downloadToFile:', e);
            throw e;
          }
        });
      if (errors.length > 0) {
        throw errors[0];
      }
    } finally {
      await handler.close();
    }
  }
}
