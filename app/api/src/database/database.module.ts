import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

// Global: every feature module needs the database, and re-importing it in each
// one adds noise without adding isolation.
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
