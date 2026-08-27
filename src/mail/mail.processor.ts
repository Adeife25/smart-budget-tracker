import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { Resend } from 'resend';
import { EMAIL_QUEUE, EMAIL_SEND_JOB } from '../queues/queue.constants';
import { EmailJobData } from './mail.service';

@Processor(EMAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    super();
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from =
      this.configService.get<string>('EMAIL_FROM') ||
      'Smart Budget Tracker <onboarding@resend.dev>';
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    if (job.name !== EMAIL_SEND_JOB) return;

    const { to, subject, html, devLinkLabel, devLink } = job.data;

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not set — ${devLinkLabel} link for ${to}: ${devLink}`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });

    if (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 0;
      if (statusCode >= 400 && statusCode < 500) {
        // Client errors (bad address, validation, auth) are permanent —
        // retrying would only add latency. Complete the job without a retry.
        this.logger.warn(
          `Permanent failure sending "${subject}" to ${to}: ${error.message}`,
        );
        return;
      }

      this.logger.warn(
        `Attempt ${job.attemptsMade + 1} failed sending "${subject}" to ${to}: ${error.message}`,
      );
      throw new Error(error.message || 'Unknown email delivery error');
    }

    if (job.attemptsMade > 0) {
      this.logger.log(
        `Email (${subject}) delivered to ${to} on attempt ${job.attemptsMade + 1}`,
      );
    }
  }
}
