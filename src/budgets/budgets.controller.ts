import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RedisCacheInterceptor } from '../common/interceptors/redis-cache.interceptor';

@ApiTags('Budgets')
@Controller('budgets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({
    summary:
      'List budgets with totals (total budget, total spent, remaining) and per-budget spend, percentage and status',
  })
  findAll(@Request() req: { user: { id: string } }) {
    return this.budgetsService.findAll(req.user.id);
  }

  @Get(':id')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({ summary: 'Get a budget by id' })
  findOne(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.budgetsService.findOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new budget' })
  create(
    @Body() dto: CreateBudgetDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.budgetsService.create(req.user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a budget' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.budgetsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a budget' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.budgetsService.remove(id, req.user.id);
  }
}
