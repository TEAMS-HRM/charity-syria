import { Controller, Get, Header } from '@nestjs/common';
import { DatabaseHealth, DatabaseService } from '../database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /**
   * The ALB target group polls this every 30s and deregisters the task if it
   * stops returning 200. It deliberately does NOT touch the database: a brief
   * database blip should not cause ECS to kill every task and take the whole
   * service down with it. Depth belongs on /health/db.
   */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Deep check, for humans and dashboards. Always 200 - a failing database is a
   * diagnosis to read, not a reason for the load balancer to act.
   */
  @Get('health/db')
  @Header('Cache-Control', 'no-store')
  async databaseHealth(): Promise<DatabaseHealth> {
    return this.database.check();
  }
}
