import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List notifications (newest first) with pagination and the unread count',
  })
  findAll(
    @Request() req: { user: { id: string } },
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.findAll(
      req.user.id,
      query.page,
      query.limit,
      query.unreadOnly,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count of unread notifications' })
  getUnreadCount(@Request() req: { user: { id: string } }) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read (idempotent)' })
  markRead(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.notificationsService.markRead(req.user.id, id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark every notification as read' })
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.notificationsService.remove(req.user.id, id);
  }
}
