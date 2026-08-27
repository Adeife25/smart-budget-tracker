import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EMAIL_QUEUE, EMAIL_SEND_JOB } from '../queues/queue.constants';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  devLinkLabel: string;
  devLink: string;
}

const RETRY_ATTEMPTS = 3;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue) {}

  async sendVerificationEmail(email: string, link: string): Promise<void> {
    await this.enqueue({
      to: email,
      subject: 'Verify your email',
      html: `<p>Welcome! Click the link below to verify your email address:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
      devLinkLabel: 'verification',
      devLink: link,
    });
  }

  async sendPasswordResetEmail(email: string, link: string): Promise<void> {
    await this.enqueue({
      to: email,
      subject: 'Reset your password',
      html: `<p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>`,
      devLinkLabel: 'password-reset',
      devLink: link,
    });
  }

  private async enqueue(input: EmailJobData): Promise<void> {
    try {
      await this.emailQueue.add(EMAIL_SEND_JOB, input, {
        attempts: RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue "${input.subject}" email for ${input.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
