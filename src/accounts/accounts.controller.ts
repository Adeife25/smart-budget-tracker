import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RedisCacheInterceptor } from '../common/interceptors/redis-cache.interceptor';

@ApiTags('Accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({ summary: 'List all accounts for the current user' })
  findAll(@Request() req: { user: { id: string } }) {
    return this.accountsService.findAll(req.user.id);
  }

  @Get(':id')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({ summary: 'Get an account by id' })
  findOne(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.accountsService.findOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new account' })
  create(
    @Body() dto: CreateAccountDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.accountsService.create(req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an account' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.accountsService.remove(id, req.user.id);
  }
}
