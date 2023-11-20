import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { TxService } from './tx.service';
import { BroadcastTxDto } from './dto/broadcastTx.dto';
import { RpcService } from '../../service/rpc/rpc.service';
import { ApiTags } from '@nestjs/swagger';

@Controller()
export class TxController {
  constructor(
    private readonly txService: TxService,
    private readonly rpcService: RpcService,
  ) {}

  @ApiTags('tx')
  @Post('/tx/broadcast')
  async broadcastTx(@Body() broadcastTxDto: BroadcastTxDto) {
    try {
      const resp = await this.rpcService.pushTx(broadcastTxDto.hex);
      return {
        txid: resp.data.result,
        message: 'ok',
      };
    } catch (e) {
      return {
        txid: '',
        message: JSON.stringify(e.response.data.error),
      };
    }
  }
}
