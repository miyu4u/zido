import { Module } from '@nestjs/common'
import { PlaceDomainModule } from 'zido/place-domain'

/**
 * MCP protocol 계층 없이 장소 domain만 CLI process에 주입한다.
 */
@Module({
    imports: [PlaceDomainModule],
})
export class CliAppModule {}
