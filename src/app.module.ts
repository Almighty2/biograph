import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UtilisateurModule } from './utilisateur/utilisateur.module';
import { BookModule } from './book/book.module';
import { AiModule } from './ai/ai.module';
import { MediaModule } from './media/media.module';
import { OrderModule } from './order/order.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { NotificationModule } from './notification/notification.module';
import { WritingStatModule } from './writing-stat/writing-stat.module';
import { SupportModule } from './support/support.module';
import { OpenAIModule } from './openia/openia.module';
import { ScheduleModule } from '@nestjs/schedule';



@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'), // Le répertoire où les fichiers sont stockés
      serveRoot: '/uploads', // Le chemin d'URL pour accéder aux fichiers,
    }),
    ScheduleModule.forRoot(),  // pour le cron
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UtilisateurModule,
    BookModule,
    AiModule,
    MediaModule,
    OrderModule,
    BlockchainModule,
    NotificationModule,
    WritingStatModule,
    SupportModule,
    OpenAIModule,
  ],
    //OtpModule, NotificationModule, KycModule, UploadModule, OcrModule, UserSouscripteurWebModule, UserSouscripteurBackofficeModule],
  controllers: [],
  providers: [],
  
})
export class AppModule {}

/*
export class AppModule implements NestModule  {
    configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        // Exclure Swagger UI
        { path: 'swagger-ui.html', method: RequestMethod.GET },
        { path: 'api-docs', method: RequestMethod.GET },
        { path: 'api-docs', method: RequestMethod.HEAD },
        { path: 'swagger-ui.html', method: RequestMethod.HEAD },
        { path: '/configuration/(.*)', method: RequestMethod.ALL },
        { path: '/subscriber/backoffice/(.*)', method: RequestMethod.ALL },
        { path: '/backoffice/(.*)', method: RequestMethod.ALL },
        // Exclure les fichiers Swagger (ex: CSS, JS)
        { path: 'swagger-ui.html/(.*)', method: RequestMethod.ALL },
        { path: 'swagger-ui/(.*)', method: RequestMethod.ALL },
        { path: 'swagger-ui-init.js', method: RequestMethod.GET },
        { path: 'swagger-ui-bundle.js', method: RequestMethod.GET },
        { path: 'swagger-ui-standalone-preset.js', method: RequestMethod.GET },
        // Ajoute ici d'autres routes publiques si besoin

        //mobile
        { path: '/assure-physique/mobile/(.*)', method: RequestMethod.ALL },
        { path: '/mobile/(.*)', method: RequestMethod.ALL },
        { path: '/subscribers/register/otp/(.*)', method: RequestMethod.ALL },
        { path: '/subscribers/register/mobile/(.*)', method: RequestMethod.ALL },
        { path: '/backoffice/(.*)', method: RequestMethod.ALL },

      )
      .forRoutes({ path: '*', method: RequestMethod.ALL }); // Appliquer à tout le reste
  }
}
*/