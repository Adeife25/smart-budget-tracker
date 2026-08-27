import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: { status: jest.Mock; json: jest.Mock };
  let request: { method: string; url: string };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    request = { method: 'GET', url: '/api/transactions' };
  });

  const invoke = (exception: unknown) => {
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
  };

  const jsonBody = (): {
    statusCode: number;
    message: string | string[];
    path: string;
    timestamp: string;
  } =>
    (
      response.json.mock.calls as unknown as [
        {
          statusCode: number;
          message: string | string[];
          path: string;
          timestamp: string;
        },
      ][]
    )[0][0];

  it('normalizes HttpExceptions with a string message', () => {
    invoke(new NotFoundException('Transaction with id 1 not found'));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const body = jsonBody();
    expect(body).toMatchObject({
      statusCode: 404,
      message: 'Transaction with id 1 not found',
      path: '/api/transactions',
    });
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('preserves validation error arrays from the ValidationPipe', () => {
    const validationError = new BadRequestException([
      'status must be one of the following values',
    ]);
    invoke(validationError);

    expect(jsonBody().message).toEqual([
      'status must be one of the following values',
    ]);
  });

  it('maps P2002 unique constraint to 409', () => {
    invoke(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'A record with these details already exists',
      }),
    );
  });

  it('maps P2003 foreign key failure to 400', () => {
    invoke(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' },
      ),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'A related record does not exist',
      }),
    );
  });

  it('names the offending column when P2003 carries meta.field_name', () => {
    invoke(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: 'test',
          meta: { field_name: 'Transaction_categoryId_fkey (index)' },
        },
      ),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonBody().message).toBe(
      'Related record not found: categoryId does not exist',
    );
  });

  it('names the offending column from driver-adapter constraint metadata', () => {
    invoke(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `categoryId`',
        {
          code: 'P2003',
          clientVersion: 'test',
          meta: {
            modelName: 'Transaction',
            driverAdapterError: {
              name: 'DriverAdapterError',
              cause: {
                originalCode: '23503',
                kind: 'ForeignKeyConstraintViolation',
                constraint: { index: 'Transaction_categoryId_fkey' },
              },
            },
          },
        },
      ),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonBody().message).toBe(
      'Related record not found: categoryId does not exist',
    );
  });

  it('maps P2025 record-not-found to 404', () => {
    invoke(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('hides details of unexpected errors behind a generic 500', () => {
    invoke(new Error('database password leaked'));

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(jsonBody().message).toBe('Internal server error');
  });
});
