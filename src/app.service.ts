import { Injectable } from '@nestjs/common';
import { SubscribeMessage } from '@nestjs/websockets';
import { Socket } from 'dgram';
import { EventsGateway } from './events.gateway';

@Injectable()
export class AppService {
  constructor(private readonly eventGateWay: EventsGateway) {}
  getHello() {
    // this.eventGateWay.userAccess({
    //   door_id: 4,
    //   qr_code:
    //     'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MTcsImRvY3VtZW50X2lkIjoiMDAwMDAxIiwidGltZSI6IjIwMjMtMDUtMDMifQ.jcEUqWKGQx0ml25NPT10nTyl97V6ljCyjcerpd_uTMQ',
    // });
    return 'Hello World!';
  }

  @SubscribeMessage('events')
  testSocket(client: Socket, data: string): void {
    console.log('test socket');
  }
}
