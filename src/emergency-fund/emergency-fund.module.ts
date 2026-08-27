import { Module } from '@nestjs/common';
import { EmergencyFundService } from './emergency-fund.service';
import { EmergencyFundController } from './emergency-fund.controller';

@Module({
  controllers: [EmergencyFundController],
  providers: [EmergencyFundService],
})
export class EmergencyFundModule {}
