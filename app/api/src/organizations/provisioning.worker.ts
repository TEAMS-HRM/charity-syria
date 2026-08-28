import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { loadConfig } from "../config";
import { OrganizationsService } from "./organizations.service";

@Injectable()
export class ProvisioningWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ProvisioningWorkerService.name);
  private readonly config = loadConfig();
  private readonly enabled = this.config.provisioning.workerEnabled;
  private readonly intervalMs = this.config.provisioning.workerIntervalMs;

  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(private readonly organizations: OrganizationsService) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("Provisioning worker is disabled (set PROVISIONING_WORKER_ENABLED=true to enable)");
      return;
    }

    this.logger.log(`Provisioning worker enabled with ${this.intervalMs}ms interval`);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.inFlight) {
      return;
    }

    this.inFlight = true;
    try {
      const result = await this.organizations.runProvisioningOnce();
      if (result.status === "processed") {
        this.logger.log(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Provisioning tick failed: ${message}`);
    } finally {
      this.inFlight = false;
    }
  }
}
