import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Eureka } from 'eureka-js-client';
import { writeFileSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  /*
  app.enableCors({
    origin: '*', // Remplacez par l'origine spécifique ou utilisez '*' pour toutes les origines
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Si vous avez besoin d'envoyer des cookies
  });
  */
  
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('customers-particular-service')
    .setDescription('Customers Particular Service API')
    .setVersion('1.0')
    .addTag('customers')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Écriture optionnelle du JSON Swagger dans un fichier
  writeFileSync('./swagger-spec.json', JSON.stringify(document, null, 2));

  // Sert Swagger UI à /swagger-ui.html
  SwaggerModule.setup('swagger-ui.html', app, document);

  // Sert JSON OpenAPI à /api-docs
  app.use('/api-docs', (req, res) => {
    res.json(document);
  });

  const port = parseInt(process.env.PORT || '8091', 10);

  await app.listen(port);

  console.log(`connecter ${process.env.PORT}`)

  // Eureka configuration
  
  const eureka = new Eureka({
    instance: {
      app: 'customers-particular-service',
      hostName: process.env.HOSTNAME,
      ipAddr: process.env.HOSTNAME,
      port: {
        '$': port,
        '@enabled': true,
      },
      vipAddress: 'customers-particular-service',
      dataCenterInfo: {
        '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
        name: 'MyOwn',
      },
      statusPageUrl: `http://${process.env.HOSTNAME}:${port}/swagger-ui.html`,
      homePageUrl: `http://${process.env.HOSTNAME}:${port}`,
      //statusPageUrl: `http://192.168.112.165:28080/customers-service/swagger-ui.html`,
      //homePageUrl: `http://192.168.112.165:28080/customers-service`,
    },
    eureka: {
      host: process.env.EUREKA_HOST,
      port: process.env.EUREKA_PORT,
      servicePath: '/eureka/apps',
    },
  });

  eureka.start((error) => {
    if (error) {
      console.error('Erreur d’enregistrement auprès de Eureka:', error);
    } else {
      console.log('Enregistré auprès de Eureka avec succès');
    }
  });
  
}
bootstrap();
