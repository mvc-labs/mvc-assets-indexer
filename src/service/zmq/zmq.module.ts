import { Module } from '@nestjs/common';
import { ZmqService } from './zmq.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],

  providers: [ZmqService],
  exports: [ZmqService],
})
export class ZmqModule {}
