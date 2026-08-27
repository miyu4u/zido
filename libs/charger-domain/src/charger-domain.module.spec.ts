import { Test } from '@nestjs/testing'
import { KecoAPIService, KecoService } from 'zido/charger-providers'
import { ChargerDomainModule } from './charger-domain.module'
import { RefreshCoordinator } from './refresh-coordinator'

describe('ChargerDomainModule', () => {
  it('KecoAPIService에서 KecoService와 RefreshCoordinator까지 graph를 resolve한다', async () => {
    /** 실제 application module graph를 compile한 testing module입니다. */
    const moduleRef = await Test.createTestingModule({
      imports: [ChargerDomainModule],
    }).compile()

    expect(moduleRef.get(KecoAPIService)).toBeInstanceOf(KecoAPIService)
    expect(moduleRef.get(KecoService)).toBeInstanceOf(KecoService)
    expect(moduleRef.get(RefreshCoordinator)).toBeInstanceOf(RefreshCoordinator)

    await moduleRef.close()
  })
})
