import { Injectable, Logger } from '@nestjs/common';
import * as zmq from 'zeromq';
import { ConfigService } from '@nestjs/config';

const monitorEventList = [
  'connect',
  'connect_delay',
  'connect_retry',
  'listen',
  'bind_error',
  'accept',
  'accept_error',
  'close',
  'close_error',
  'disconnect',
];

@Injectable()
export class ZmqService {
  private readonly logger = new Logger(ZmqService.name);
  private readonly callBackQueueRawTx: any[];
  private readonly callBackQueueHashBlock: any[];

  constructor(private readonly configService: ConfigService) {
    const _zmqServer = this.configService.get('zmqServer');
    const zmqSubEventList = this.configService.get('zmqSubEventList');
    const zmqDebug = this.configService.get('zmqDebug');
    const zmqServerList = _zmqServer.split(',');
    const sock = zmq.socket('sub');
    if (zmqDebug) {
      sock.monitor(5, 0);
      for (const monitorEvent of monitorEventList) {
        sock.on(monitorEvent, this.monitorHandler.bind(this));
      }
      sock.on('monitor_error', this.monitorErrorHandler.bind(this));
    }
    sock.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
    sock.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 60);
    sock.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_INTVL, 1);
    this.callBackQueueRawTx = [];
    this.callBackQueueHashBlock = [];
    for (const zmqServer of zmqServerList) {
      if (zmqServer.trim()) {
        sock.connect(zmqServer);
        sock.on('message', this.zmqProcess.bind(this));
        for (const zmqSubEvent of zmqSubEventList) {
          sock.subscribe(zmqSubEvent);
        }
      }
    }
  }

  monitorHandler(
    event: any,
    event_value: any,
    event_endpoint_addr: any,
    ex: any,
  ) {
    this.logger.debug(
      `monitorHandler ${event} ${event_value} ${event_endpoint_addr} ${ex}`,
    );
  }

  monitorErrorHandler(error: any) {
    this.logger.debug(`monitorErrorHandler ${error}`);
  }

  onRawTx(func: any) {
    this.callBackQueueRawTx.push(func);
  }

  onHashBlock(func: any) {
    this.callBackQueueHashBlock.push(func);
  }

  private static mapCallbackByQueue(message: Buffer, queue: any[]) {
    for (const callback of queue) {
      try {
        callback(message);
      } catch (e) {}
    }
  }

  private eventHandlerRawTx(message: Buffer) {
    ZmqService.mapCallbackByQueue(message, this.callBackQueueRawTx);
  }

  private eventHandlerHashBlock(message: Buffer) {
    ZmqService.mapCallbackByQueue(message, this.callBackQueueHashBlock);
  }

  private zmqProcess(topic: { toString: () => any }, message: Buffer) {
    const topicStr = topic.toString();
    if (topicStr === 'rawtx') {
      this.eventHandlerRawTx(message);
    }
    if (topicStr === 'hashblock') {
      this.eventHandlerHashBlock(message);
    }
  }
}
