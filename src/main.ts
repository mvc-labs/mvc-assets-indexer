import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import * as process from 'process';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('MicroVisionChain Assets Indexer API Document')
    .setVersion('1.0.0')
    .setLicense('MIT License', 'https://opensource.org/licenses/MIT')
    .setContact(
      'Cyber3 Space team',
      'https://github.com/cyber3-space',
      'george@cyber3.space',
    )
    .addServer('https://mvcapi.cyber3.space')
    .addTag('block')
    .addTag('tx')
    .addTag('address')
    .addTag('contract')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('', app, document, {
    customSiteTitle: 'MicroVisionChain API',
  });
  await app.listen(parseInt(process.env.PORT));
}

bootstrap();
