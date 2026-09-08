import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { OAuthService } from './oauth.service';
import { resolveSecret } from '../config/secrets';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: resolveSecret(configService, 'JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', 3600),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: GoogleStrategy,
      useFactory: (configService: ConfigService, oauthService: OAuthService) => {
        return configService.get('GOOGLE_CLIENT_ID')
          ? new GoogleStrategy(configService, oauthService)
          : undefined;
      },
      inject: [ConfigService, OAuthService],
    },
    {
      provide: GithubStrategy,
      useFactory: (configService: ConfigService, oauthService: OAuthService) => {
        return configService.get('GITHUB_CLIENT_ID')
          ? new GithubStrategy(configService, oauthService)
          : undefined;
      },
      inject: [ConfigService, OAuthService],
    },
    OAuthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
