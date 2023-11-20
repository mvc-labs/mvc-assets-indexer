import { Module } from '@nestjs/common';
import { TxService } from './tx.service';
import { TxController } from './tx.controller';
import { RpcModule } from '../../service/rpc/rpc.module';

@Module({
  imports: [RpcModule],
  controllers: [TxController],
  providers: [TxService],
})
export class TxModule {}
