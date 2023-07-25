import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export interface IKapriResponse {
  msgArg: {
    sData: string;
    sEUI64: string;
    sPosition: string;
  };
  msgTimeStamp: number;
  msgType: string;
}

@WebSocketGateway()
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  baseUrl: string;
  scanProcess: string[] = [];
  constructor(private readonly httpService: HttpService) {
    this.baseUrl = process.env.API_URL;
  }

  @WebSocketServer() server: Server;
  private logger = new Logger('SOCKET');

  afterInit(ts) {
    this.logger.log('WebSocket Server initializsed');
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('http_sio_event')
  async testEvent(@MessageBody() _data: string) {
    console.log('**** INIT');
    const eventData: IKapriResponse = JSON.parse(_data);

    const isEventScan = eventData.msgType === 'on_uart_receive';

    const code_qr = eventData.msgArg.sData;
    const sEUI64 = eventData.msgArg.sEUI64;

    const isProcess = this.scanProcess.includes(sEUI64);
    let url = null;
    if (isEventScan && code_qr && sEUI64 && !isProcess) {
      this.scanProcess.push(sEUI64);
      try {
        const res = await this.httpService
          .post(`${this.baseUrl}/iot_socket`, {
            code_qr,
            sEUI64,
          })
          .toPromise();
        const data = res.data;
        const doors = data.doors;
        const user = data.user;
        url = data.iot.url_address;
        await this.setLoading(url);
        const fullName = data.full_name;

        if (doors.length > 1) {
          this.server.emit(`user_${user.id}_access`, {
            doors,
            fullName,
            url,
          });
        } else {
          const [door] = doors;
          this.server.emit(`access_${data.user.id}_success`, {
            message: 'Puerta abierta correctamente',
          });
          await this.activateRelay(url, door, fullName);
        }
      } catch (error) {
        console.log('Error en evento');
        if (url) await this.setDefaultView(url);
      }
      this.scanProcess.splice(this.scanProcess.indexOf(sEUI64), 1);
    }
    console.log('**** END');
  }

  // on('user_${userID}_select', () => {

  // })

  // @SubscribeMessage('user_18_access_select')
  // async a(_data: any) {
  //   this.activateRelay(_data.url, _data.door, _data.fullName);
  // }

  @SubscribeMessage('user_access')
  async userAccess(client: Socket, dto: { door_id: number; qr_code: string }) {
    const { data } = await this.httpService
      .post(`${this.baseUrl}/get_access_qr`, {
        door_id: dto.door_id,
        qr_code: dto.qr_code,
      })
      .toPromise();
    const door = data.door;
    const url = data.iot.url_address;
    const fullName = data.full_name;

    client?.emit(`access_${data.user.id}_success`, {
      message: 'Puerta abierta correctamente',
    });
    await this.activateRelay(
      url,
      {
        door_id: door.id,
        door_name: door.name,
        relay_num: door.relay_num,
      },
      fullName,
    );
  }
  // async
  async activateRelay(url: string, door: any, fullName: string) {
    try {
      const payload = {
        msgType: 'ins_inout_relay_operate',
        msgArg: {
          sPosition: 'main',
          ucRelayNum: door.relay_num,
          ucTime_ds: 10,
        },
      };

      await this.httpService
        .post(`${url}/api/instruction`, payload)
        .toPromise();
      await this.printMessage(url, fullName, door.door_name);
      await sleep(5000);
      await this.setDefaultView(url);
    } catch (error) {
      await console.log('Fallo al activar rele');
    }
  }

  async printMessage(url, fullName, accessName) {
    try {
      const time = new Date().toLocaleString();
      const sHtml = this.permitTemplate({
        fullName,
        time,
        accessName,
      });
      const payload = {
        msgType: 'ins_screen_html_document_write',
        msgArg: {
          sHtml,
        },
      };

      await this.httpService
        .post(`${url}/api/instruction`, payload)
        .toPromise();
    } catch (error) {
      this.errorActivate(url);
      console.log('Fallo al mostrar mensaje');
    }
  }

  permitTemplate(dto): string {
    const { fullName, time, accessName } = dto;
    return `
    <style>
      .container {
        width: 320px;
        height: 240px;
        border: solid 1px #ccc;
        background-image: url('background2.jpeg');
        background-size: cover;
        background-repeat: no-repeat;
      }
      .container h1 {
        margin-top: 30px;
      }
    </style>

    <div class="container" style="text-align: center;">
      <h1 style="color: green">Acceso permitido</h1>

      <h3>Bienvenido ${fullName}</h3>
      <h4>Hora: ${time}</h4>

      <h3>Abriendo acceso: ${accessName}</h3>
    </div>
    `;
  }

  errorActivateTemplate(): string {
    return `
      <div class="container" style="text-align: center;">
        <h1 style="color: red">Error</h1>
      
        <h3>Vuelva a intentarlo</h3>
      </div>
    `;
  }

  async setDefaultView(url) {
    try {
      const payload = {
        msgType: 'ins_screen_html_document_write',
        msgArg: {
          sHtml: '<img src="boot.jpg"/>',
        },
      };
      await this.httpService
        .post(`${url}/api/instruction`, payload)
        .toPromise();
    } catch (error) {
      console.log('Fallo al colocar la vista por defecto');
    }
  }

  async setLoading(url) {
    try {
      const payload = {
        msgType: 'ins_screen_html_document_write',
        msgArg: {
          sHtml: '<img src="loading.gif" width="320" height="240"/>',
        },
      };
      await this.httpService
        .post(`${url}/api/instruction`, payload)
        .toPromise();
    } catch (error) {
      console.log('Fallo al colocar el loading');
    }
  }

  async errorActivate(url) {
    try {
      const payload = {
        msgType: 'ins_screen_html_document_write',
        msgArg: {
          sHtml: this.errorActivateTemplate(),
        },
      };
      await this.httpService
        .post(`${url}/api/instruction`, payload)
        .toPromise();
      await sleep(3000);
      await this.setDefaultView(url);
    } catch (error) {
      console.log('Fallo al colocar el error activate');
    }
  }
}
