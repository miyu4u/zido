import { KakaoVendor } from 'zido/map-providers'
import type { Place } from 'zido/map-providers'

// 1. zido/common 모듈을 mock하여 deterministic config를 보장한다.
jest.mock('zido/common', () => {
    const actual = jest.requireActual('zido/common') as Record<string, unknown>
    return {
        ...actual,
        config: {
            server: {
                name: 'zido-cli-test',
                version: '1.0.0-test',
                httpPort: 8000,
                allowedOrigins: ['http://localhost:3000'],
            },
            providers: {
                order: ['kakao', 'naver', 'google'],
                kakao: {
                    restKey: 'dummy-kakao-key',
                },
                naver: {
                    clientId: 'dummy-naver-id',
                    clientSecret: 'dummy-naver-secret',
                },
                google: {
                    apiKey: 'dummy-google-key',
                },
            },
        },
    }
})

describe('CLI E2E Smoke Test', () => {
    let originalArgv: string[]
    let originalExitCode: typeof process.exitCode
    let stdoutWriteSpy: jest.SpyInstance
    let stderrWriteSpy: jest.SpyInstance

    beforeEach(() => {
        originalArgv = process.argv
        originalExitCode = process.exitCode
        // stdout/stderr 출력을 가로채기 위해 spyOn 설정
        stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
        stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
        process.argv = originalArgv
        process.exitCode = originalExitCode
        jest.restoreAllMocks()
    })

    it('resolve 명령을 실행하면 Kakao resolve를 호출하고 성공 결과를 stdout에 출력한다', async () => {
        // dynamic import 되기 전에 process.argv와 spy를 설정하여 top-level 실행에 적용한다.
        process.argv = ['node', 'zido', 'resolve', '서울역']

        const mockPlace: Place = {
            name: '서울역',
            address: '서울특별시 중구 봉래동2가 122',
            roadAddress: '서울특별시 중구 한강대로 405',
            lat: 37.555,
            lng: 126.971,
            provider: 'kakao',
            raw: { mock: true },
        }

        const kakaoResolveSpy = jest.spyOn(KakaoVendor.prototype, 'resolve')
            .mockResolvedValue(mockPlace)

        process.exitCode = undefined

        // Using require instead of dynamic import to control the execution order and environment setup without triggering Node VM module constraints.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/main')

        // void run()의 비동기 실행이 끝날 때까지 (exitCode가 설정될 때까지) 대기한다.
        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (process.exitCode !== undefined) {
                    clearInterval(interval)
                    resolve()
                }
            }, 10)
        })

        expect(kakaoResolveSpy).toHaveBeenCalledWith('서울역')
        expect(process.exitCode).toBe(0)

        const stdoutCalls = stdoutWriteSpy.mock.calls.map((call) => call[0] as string).join('')
        expect(stdoutCalls).toContain('서울역')
    })
})
