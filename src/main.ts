import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';



async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  
  /*app.setGlobalPrefix('api/v1'); */
  app.setGlobalPrefix('api/v1', {  //Ajouter 
  exclude: [{ path: 'swagger-ui.html', method: RequestMethod.GET }] //Ajouter 
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true })); //Ajouter 
  // Servir les fichiers du dossier uploads/ via /uploads/...
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  

  const config = new DocumentBuilder()
    .setTitle(process.env.APP_NAME??'projet-x-service')
    .setDescription('API du projet-x-service')
    .setVersion('1.0')
    .addTag('customers')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Écriture optionnelle du JSON Swagger dans un fichier
  writeFileSync('./swagger-spec.json', JSON.stringify(document, null, 2));

  // Sert Swagger UI à /swagger-ui.html
  SwaggerModule.setup('swagger-ui.html', app, document); //Ajouter 

  // Sert JSON OpenAPI à /api-docs
  app.use('/api-docs', (req, res) => {
    res.json(document);
  });

  const port = parseInt(process.env.PORT_API??'8092', 10);
  app.enableCors();
  await app.listen(port);

  console.log(`connecter : ${port}`)
  
}
bootstrap();
