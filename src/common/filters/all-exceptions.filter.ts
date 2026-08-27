import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface ErrorEnvelope {
  statusCode: number;
  message: string | string[];
  error?: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status}${
          typeof message === 'string' ? ` (${message})` : ''
        }`,
      );
    }

    const body: ErrorEnvelope = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    if (error) {
      body.error = error;
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    message: string | string[];
    error?: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { status, message: res, error: exception.name };
      }
      const body = res as { message?: string | string[]; error?: string };
      return {
        status,
        message: body.message ?? exception.message,
        error: body.error ?? exception.name,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private resolvePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with these details already exists',
          error: 'Conflict',
        };
      case 'P2003': {
        const field = this.extractForeignKeyField(exception);
        return {
          status: HttpStatus.BAD_REQUEST,
          message: field
            ? `Related record not found: ${field} does not exist`
            : 'A related record does not exist',
          error: 'Bad Request',
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      default:
        this.logger.error(
          `Unhandled Prisma error ${exception.code}: ${exception.message}`,
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        };
    }
  }

  private extractForeignKeyField(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string | null {
    const meta = exception.meta as
      | {
          field_name?: unknown;
          driverAdapterError?: {
            cause?: { constraint?: { index?: unknown } };
          };
        }
      | undefined;

    const fieldName =
      typeof meta?.field_name === 'string' ? meta.field_name : null;
    const constraintIndex =
      typeof meta?.driverAdapterError?.cause?.constraint?.index === 'string'
        ? meta.driverAdapterError.cause.constraint.index
        : null;

    const source = fieldName ?? constraintIndex;
    if (!source) {
      return null;
    }
    const withoutConstraint = source.replace(/_fkey.*$/, '');
    const parts = withoutConstraint.split('_');
    return parts[parts.length - 1] || null;
  }
}
