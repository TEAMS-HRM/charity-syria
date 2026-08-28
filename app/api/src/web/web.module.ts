import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WebController } from "./web.controller";

@Module({
  imports: [AuthModule],
  controllers: [WebController],
})
export class WebModule {}
