import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { JwtAuthGuard } from '../auth/auth.guard';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all transactions for the current user' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'accountId', required: false })
  findAll(
    @Request() req: { user: { id: string } },
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.transactionsService.findAll(req.user.id, {
      type,
      categoryId,
      accountId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by id' })
  findOne(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.transactionsService.findOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  create(
    @Body() dto: CreateTransactionDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.transactionsService.create(req.user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a transaction' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.transactionsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a transaction' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.transactionsService.remove(id, req.user.id);
  }
}
