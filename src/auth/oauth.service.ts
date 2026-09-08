import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, SafeUser } from './auth.service';

export type OAuthProvider = 'GOOGLE' | 'GITHUB';

export interface OAuthProfile {
  name: string;
  email: string;
  provider: OAuthProvider;
  providerAccountId: string;
}

interface OAuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async handleOAuthLogin(profile: OAuthProfile): Promise<OAuthResult> {
    if (!profile.email) {
      throw new BadRequestException(
        `Could not retrieve an email address from your ${profile.provider} account.`,
      );
    }

    const email = this.authService.normalizeEmail(profile.email);

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          name: profile.name || email.split('@')[0],
          email,
          password: null,
          emailVerified: true,
          verifiedAt: new Date(),
        },
      });
    }

    await this.prisma.providerAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      create: {
        userId: user.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
      update: {
        userId: user.id,
      },
    });

    const tokens = await this.authService.issueTokens(user.id, user.email);

    return {
      user: this.authService.sanitizeUser(user),
      ...tokens,
    };
  }
}
