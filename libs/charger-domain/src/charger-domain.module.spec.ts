import { Test } from '@nestjs/testing'
import { KEcoAPIService, KEcoService } from 'zido/charger-providers'
import { ChargerDomainModule } from './charger-domain.module'
import { RefreshCoordinator } from './refresh-coordinator'

describe('ChargerDomainModule', () => {
  it('KEcoAPIService에서 KEcoService와 RefreshCoordinator까지 graph를 resolve한다', async () => {
    /** 실제 application module graph를 compile한 testing module입니다. */
    const moduleRef = await Test.createTestingModule({
      imports: [ChargerDomainModule],
    }).compile()

    expect(moduleRef.get(KEcoAPIService)).toBeInstanceOf(KEcoAPIService)
    expect(moduleRef.get(KEcoService)).toBeInstanceOf(KEcoService)
    expect(moduleRef.get(RefreshCoordinator)).toBeInstanceOf(RefreshCoordinator)

    await moduleRef.close()
  })
})
