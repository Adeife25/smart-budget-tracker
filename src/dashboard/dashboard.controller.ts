import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RedisCacheInterceptor } from '../common/interceptors/redis-cache.interceptor';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { TrendQueryDto } from './dto/trend-query.dto';
import { RecentTransactionsQueryDto } from './dto/recent-transactions-query.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({
    summary:
      'Financial summary for a date range: totals, savings rate and safe-to-spend',
  })
  getSummary(
    @Request() req: { user: { id: string } },
    @Query() query: DateRangeQueryDto,
  ) {
    return this.dashboardService.getSummary(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }

  @Get('spend-by-category')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({ summary: 'Spending breakdown by category with percentages' })
  getSpendByCategory(
    @Request() req: { user: { id: string } },
    @Query() query: DateRangeQueryDto,
  ) {
    return this.dashboardService.getSpendByCategory(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }

  @Get('budget-vs-actual')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({
    summary: 'Budget vs actual spending scoped to each budget pay cycle',
  })
  getBudgetVsActual(@Request() req: { user: { id: string } }) {
    return this.dashboardService.getBudgetVsActual(req.user.id);
  }

  @Get('trend')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({
    summary: 'Monthly income, expense, net and savings rate trend',
  })
  getTrend(
    @Request() req: { user: { id: string } },
    @Query() query: TrendQueryDto,
  ) {
    return this.dashboardService.getTrend(req.user.id, query.months);
  }

  @Get('recent-transactions')
  @ApiOperation({ summary: 'Most recent transactions' })
  getRecentTransactions(
    @Request() req: { user: { id: string } },
    @Query() query: RecentTransactionsQueryDto,
  ) {
    return this.dashboardService.getRecentTransactions(
      req.user.id,
      query.limit,
    );
  }

  @Get('alerts')
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({ summary: 'Rule-based alerts and tips' })
  getAlerts(@Request() req: { user: { id: string } }) {
    return this.dashboardService.getAlerts(req.user.id);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export transactions in range as CSV' })
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  exportCsv(
    @Request() req: { user: { id: string } },
    @Query() query: DateRangeQueryDto,
  ) {
    return this.dashboardService.exportTransactionsCsv(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }
}
