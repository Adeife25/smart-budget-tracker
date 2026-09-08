import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../oauth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    configService: ConfigService,
    private readonly oauthService: OAuthService,
  ) {
    super({
      clientID: configService.get<string>('GITHUB_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('GITHUB_CALLBACK_URL') || '',
      scope: ['user:email'],
      passReqToCallback: false,
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: unknown) => void,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value ?? profile.username ?? '';
    try {
      const result = await this.oauthService.handleOAuthLogin({
        name:
          profile.displayName || profile.username || email.split('@')[0] || '',
        email,
        provider: 'GITHUB',
        providerAccountId: profile.id,
      });
      done(null, result);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
