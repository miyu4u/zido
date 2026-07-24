import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpException } from 'zido/common'
import type { Place, GeoResult } from 'zido/map-providers'
import type { PlaceResolveOutput, GeoGeocodeOutput, PlaceSearchNearbyOutput } from 'zido/place-domain'

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

/**
 * CLI 실행 결과를 담는 인터페이스입니다.
 */
interface RunCliResult {
    exitCode: number | undefined
    stdout: string
    stderr: string
}

/**
 * KakaoVendor, NaverVendor, GoogleVendor, PlaceService 클래스에 대한 타입 정의입니다.
 */
interface SpyTargets {
    KakaoVendor: {
        prototype: {
            resolve(query: string): Promise<Place | null>
            geocode(address: string): Promise<GeoResult | null>
            searchNearby(center: { lat: number; lng: number }, keyword: string, radius: number): Promise<Place[]>
        }
    }
    NaverVendor: {
        prototype: {
            resolve(query: string): Promise<Place | null>
            geocode(address: string): Promise<GeoResult | null>
            searchNearby(center: { lat: number; lng: number }, keyword: string, radius: number): Promise<Place[]>
        }
    }
    GoogleVendor: {
        prototype: {
            resolve(query: string): Promise<Place | null>
            geocode(address: string): Promise<GeoResult | null>
            searchNearby(center: { lat: number; lng: number }, keyword: string, radius: number): Promise<Place[]>
        }
    }
    PlaceService: {
        prototype: {
            resolve(input: unknown): Promise<PlaceResolveOutput | null>
            geocode(input: unknown): Promise<GeoGeocodeOutput | null>
            searchNearby(input: unknown): Promise<PlaceSearchNearbyOutput>
        }
    }
}

/**
 * Jest 모듈 캐시를 리셋하고 CLI 실행을 시뮬레이션하는 헬퍼 함수입니다.
 *
 * @param argv CLI 명령줄 인수 배열
 * @param setupSpies 프로토타입 스파이를 등록할 기회를 제공하는 콜백
 * @returns CLI 실행 결과(exitCode, stdout, stderr)를 반환합니다.
 */
async function runCliWithSpies(
    argv: string[],
    setupSpies?: (spies: SpyTargets) => void
): Promise<RunCliResult> {
    jest.resetModules()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const providersModule = require('zido/map-providers') as {
        KakaoVendor: SpyTargets['KakaoVendor']
        NaverVendor: SpyTargets['NaverVendor']
        GoogleVendor: SpyTargets['GoogleVendor']
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const placeDomainModule = require('zido/place-domain') as {
        PlaceService: SpyTargets['PlaceService']
    }

    if (setupSpies) {
        setupSpies({
            KakaoVendor: providersModule.KakaoVendor,
            NaverVendor: providersModule.NaverVendor,
            GoogleVendor: providersModule.GoogleVendor,
            PlaceService: placeDomainModule.PlaceService,
        })
    }

    process.argv = ['node', 'zido', ...argv]
    process.exitCode = undefined

    let stdoutData = ''
    let stderrData = ''
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdoutData += chunk.toString()
        return true
    })
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderrData += chunk.toString()
        return true
    })

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/main')

        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (process.exitCode !== undefined) {
                    clearInterval(interval)
                    resolve()
                }
            }, 5)
        })
    } finally {
        stdoutWriteSpy.mockRestore()
        stderrWriteSpy.mockRestore()
    }

    return {
        exitCode: process.exitCode,
        stdout: stdoutData,
        stderr: stderrData,
    }
}

describe('CLI E2E Contract Tests', () => {
    const originalArgv = process.argv
    const originalExitCode = process.exitCode

    afterEach(() => {
        process.argv = originalArgv
        process.exitCode = originalExitCode
    })

    describe('1. No arguments / help / version (exit code 0, side-effect-free)', () => {
        /**
         * 도움말 화면의 공통 섹션 존재 여부를 검증하는 헬퍼 함수입니다.
         *
         * @param output 도움말 출력물 문자열
         * @param isSubCommand 서브커맨드 도움말 여부
         */
        const verifyHelpSections = (output: string, isSubCommand: boolean): void => {
            expect(output).toContain('Usage:')
            expect(output).toContain('Examples:')
            expect(output).toContain('Options:')
            expect(output).toContain('Configuration:')
            if (isSubCommand) {
                expect(output).toContain('Input:')
            } else {
                expect(output).toContain('Commands:')
            }
        }

        it('인수 없이 호출하면 root 도움말을 표시하고 0으로 종료한다', async () => {
            const res = await runCliWithSpies([], ({ KakaoVendor, PlaceService }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve')
                jest.spyOn(PlaceService.prototype, 'resolve')
            })
            expect(res.exitCode).toBe(0)
            verifyHelpSections(res.stdout, false)
            expect(res.stdout).toContain('Zido는 여러 지도 provider를 공통 interface로 사용하는 장소 검색 CLI입니다.')
        })

        it('root 도움말 옵션(-h, --help) 호출 시 0으로 종료하고 도움말을 표시한다', async () => {
            const res1 = await runCliWithSpies(['-h'])
            expect(res1.exitCode).toBe(0)
            verifyHelpSections(res1.stdout, false)

            const res2 = await runCliWithSpies(['--help'])
            expect(res2.exitCode).toBe(0)
            verifyHelpSections(res2.stdout, false)
        })

        it('서브커맨드 도움말 옵션 호출 시 0으로 종료하고 해당 커맨드 도움말을 표시한다', async () => {
            const resolveHelp = await runCliWithSpies(['resolve', '--help'])
            expect(resolveHelp.exitCode).toBe(0)
            verifyHelpSections(resolveHelp.stdout, true)
            expect(resolveHelp.stdout).toContain('zido [--json] resolve <query>')

            const nearbyHelp = await runCliWithSpies(['nearby', '-h'])
            expect(nearbyHelp.exitCode).toBe(0)
            verifyHelpSections(nearbyHelp.stdout, true)
            expect(nearbyHelp.stdout).toContain('zido [--json] nearby <lat> <lng> <keyword> <radius>')

            const geocodeHelp = await runCliWithSpies(['geocode', '--help'])
            expect(geocodeHelp.exitCode).toBe(0)
            verifyHelpSections(geocodeHelp.stdout, true)
            expect(geocodeHelp.stdout).toContain('zido [--json] geocode <address>')
        })

        it('버전 옵션(-v, --version) 호출 시 package.json 버전과 일치하고 0으로 종료한다', async () => {
            const packageJsonPath = join(__dirname, '../../../package.json')
            const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
           type PackageJson = { version: string }
           const packageJsonRaw = JSON.parse(packageJsonContent)
           const packageJson: PackageJson = packageJsonRaw
           const expectedVersion = packageJson.version

            const res1 = await runCliWithSpies(['-v'])
            expect(res1.exitCode).toBe(0)
            expect(res1.stdout.trim()).toBe(expectedVersion)

            const res2 = await runCliWithSpies(['--version'])
            expect(res2.exitCode).toBe(0)
            expect(res2.stdout.trim()).toBe(expectedVersion)
        })

        it('도움말 및 버전 출력 시 실제 도메인/프로바이더 메서드가 호출되지 않는 side-effect-free 속성을 확인한다', async () => {
            let resolveCalled = false
            const res = await runCliWithSpies(['resolve', '--help'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockImplementation(() => {
                    resolveCalled = true
                    return Promise.resolve(null)
                })
            })
            expect(res.exitCode).toBe(0)
            expect(resolveCalled).toBe(false)
        })
    })

    describe('2. Usage validation (exit code 2)', () => {
        it('지원하지 않는 알 수 없는 커맨드를 입력하면 2로 종료한다', async () => {
            const res = await runCliWithSpies(['invalidcommand'])
            expect(res.exitCode).toBe(2)
            expect(res.stderr).toContain('Error [CLI_USAGE]: 알 수 없는 command입니다')
        })

        it('지원하지 않는 옵션을 입력하면 2로 종료한다', async () => {
           const res = await runCliWithSpies(['resolve', '서울역', '--foo', 'value'])
            expect(res.exitCode).toBe(2)
            expect(res.stderr).toContain('지원하지 않는 option입니다: --foo')
        })

        it('옵션에 값이 누락된 경우 2로 종료한다', async () => {
            const res = await runCliWithSpies(['resolve', '--query'])
            expect(res.exitCode).toBe(2)
            expect(res.stderr).toContain('Error [CLI_USAGE]: --query option 값이 필요합니다')
        })

        it('nearby 명령어에서 positional 인수와 named 옵션을 혼용하면 2로 종료한다', async () => {
            const res = await runCliWithSpies(['nearby', '37.556', '126.972', '카페', '1000', '--lat', '37.556'])
            expect(res.exitCode).toBe(2)
            expect(res.stderr).toContain('Error [CLI_USAGE]: nearby positional과 named input을 함께 사용할 수 없습니다')
        })

        it('nearby positional 인수 개수가 4개가 아니면 2로 종료한다', async () => {
            const res = await runCliWithSpies(['nearby', '37.556', '126.972', '카페'])
            expect(res.exitCode).toBe(2)
            expect(res.stderr).toContain('Error [CLI_USAGE]: nearby positional input은 lat, lng, keyword, radius 네 값이 필요합니다')
        })

        it('Zod validation 제약 조건을 위반하는 경우 2로 종료한다', async () => {
            // lat 범위 초과 (91)
            const resLat = await runCliWithSpies(['nearby', '91', '126.972', '카페', '1000'])
            expect(resLat.exitCode).toBe(2)

            // radiusM 범위 초과 (60000)
            const resRadius = await runCliWithSpies(['nearby', '37.556', '126.972', '카페', '60000'])
            expect(resRadius.exitCode).toBe(2)

            // empty query
            const resEmpty = await runCliWithSpies(['resolve', ''])
            expect(resEmpty.exitCode).toBe(2)
        })
    })

    describe('3. Configuration / Authentication error (exit code 3)', () => {
        it('인증 실패 시 human format으로 에러를 stdout/stderr에 출력하고 3으로 종료한다', async () => {
           const res = await runCliWithSpies(['resolve', '서울역'], ({ KakaoVendor, NaverVendor, GoogleVendor }) => {
               // eslint-disable-next-line @typescript-eslint/no-require-imports
               const { ProviderException } = require('zido/common')
        const authErrorMock = new ProviderException('Authentication failed with Kakao API', 'test', 'AUTHENTICATION_FAILED')
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockRejectedValue(authErrorMock)
               jest.spyOn(NaverVendor.prototype, 'resolve').mockRejectedValue(authErrorMock)
               jest.spyOn(GoogleVendor.prototype, 'resolve').mockRejectedValue(authErrorMock)
            })
            expect(res.exitCode).toBe(3)
            expect(res.stderr).toContain('Error [AUTHENTICATION_FAILED]')
            expect(res.stderr).toContain('provider API key와 PROVIDER_ORDER를 .env에서 확인하세요')
        })

        it('인증 실패 시 --json 옵션이 적용되면 JSON payload 형태로 에러를 stderr에 출력하고 3으로 종료한다', async () => {
           const res = await runCliWithSpies(['--json', 'resolve', '서울역'], ({ KakaoVendor, NaverVendor, GoogleVendor }) => {
               // eslint-disable-next-line @typescript-eslint/no-require-imports
               const { ProviderException } = require('zido/common')
        const authErrorMock = new ProviderException('Authentication failed with Kakao API', 'test', 'AUTHENTICATION_FAILED')
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockRejectedValue(authErrorMock)
               jest.spyOn(NaverVendor.prototype, 'resolve').mockRejectedValue(authErrorMock)
               jest.spyOn(GoogleVendor.prototype, 'resolve').mockRejectedValue(authErrorMock)
            })
            expect(res.exitCode).toBe(3)
           type ExpectedError = { code: string; message: string; hint: string }
           const parsedErrorRaw = JSON.parse(res.stderr.trim())
           const parsedError: ExpectedError = parsedErrorRaw
            expect(parsedError.code).toBe('AUTHENTICATION_FAILED')
            expect(parsedError.message).toContain('Authentication failed')
            expect(parsedError.hint).toContain('.env에서 확인하세요')
        })
    })

    describe('4. Runtime error (exit code 4)', () => {
        const genericError = new Error('Unknown connection failure')

        it('일반 런타임 에러 발생 시 human format으로 4로 종료한다', async () => {
           const res = await runCliWithSpies(['resolve', '서울역'], ({ PlaceService }) => {
               jest.spyOn(PlaceService.prototype, 'resolve').mockRejectedValue(genericError)
            })
            expect(res.exitCode).toBe(4)
            expect(res.stderr).toContain('Error [CLI_RUNTIME]: Unknown connection failure')
        })

        it('일반 런타임 에러 발생 시 --json 옵션 적용 시 JSON 형태로 에러를 출력하고 4로 종료한다', async () => {
           const res = await runCliWithSpies(['--json', 'resolve', '서울역'], ({ PlaceService }) => {
               jest.spyOn(PlaceService.prototype, 'resolve').mockRejectedValue(genericError)
            })
            expect(res.exitCode).toBe(4)
           type ExpectedError = { code: string; message: string; hint: string }
           const parsedErrorRaw = JSON.parse(res.stderr.trim())
           const parsedError: ExpectedError = parsedErrorRaw
            expect(parsedError.code).toBe('CLI_RUNTIME')
            expect(parsedError.message).toBe('Unknown connection failure')
        })
    })

    describe('5. No result (exit code 5)', () => {
        it('resolve 결과가 없을 때(null) NO_RESULT 에러를 출력하고 5로 종료한다', async () => {
           const res = await runCliWithSpies(['resolve', '없는장소'], ({ KakaoVendor, NaverVendor, GoogleVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockResolvedValue(null)
               jest.spyOn(NaverVendor.prototype, 'resolve').mockResolvedValue(null)
               jest.spyOn(GoogleVendor.prototype, 'resolve').mockResolvedValue(null)
            })
            expect(res.exitCode).toBe(5)
            expect(res.stderr).toContain('Error [NO_RESULT]: 검색 결과가 없습니다')
        })

        it('nearby 결과가 비어있을 때 NO_RESULT 에러를 출력하고 5로 종료한다', async () => {
           const res = await runCliWithSpies(['nearby', '37.556', '126.972', '카페', '100'], ({ KakaoVendor, NaverVendor, GoogleVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'searchNearby').mockResolvedValue([])
               jest.spyOn(NaverVendor.prototype, 'searchNearby').mockResolvedValue([])
               jest.spyOn(GoogleVendor.prototype, 'searchNearby').mockResolvedValue([])
            })
            expect(res.exitCode).toBe(5)
            expect(res.stderr).toContain('Error [NO_RESULT]: 검색 결과가 없습니다')
        })

        it('geocode 결과가 없을 때 NO_RESULT 에러를 --json 형식으로 출력하고 5로 종료한다', async () => {
           const res = await runCliWithSpies(['--json', 'geocode', '없는주소'], ({ KakaoVendor, NaverVendor, GoogleVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'geocode').mockResolvedValue(null)
               jest.spyOn(NaverVendor.prototype, 'geocode').mockResolvedValue(null)
               jest.spyOn(GoogleVendor.prototype, 'geocode').mockResolvedValue(null)
            })
            expect(res.exitCode).toBe(5)
           type ExpectedError = { code: string; message: string; hint: string }
           const parsedErrorRaw = JSON.parse(res.stderr.trim())
           const parsedError: ExpectedError = parsedErrorRaw
            expect(parsedError.code).toBe('NO_RESULT')
        })
    })

    describe('6. Human + JSON Output Format', () => {
        const mockPlace: Place = {
            name: '서울역',
            address: '서울특별시 중구 봉래동2가 122',
            roadAddress: '서울특별시 중구 한강대로 405',
            lat: 37.555,
            lng: 126.971,
            provider: 'kakao',
            raw: { detail: 'test' },
        }

        it('성공 시 기본 포맷(human)은 각 필드를 개별 라인으로 펼쳐서 stdout에 출력한다', async () => {
            const res = await runCliWithSpies(['resolve', '서울역'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockResolvedValue(mockPlace)
            })
            expect(res.exitCode).toBe(0)
            expect(res.stdout).toContain('Name: 서울역')
            expect(res.stdout).toContain('Address: 서울특별시 중구 봉래동2가 122')
            expect(res.stdout).toContain('Provider: kakao')
        })

        it('성공 시 --json 포맷은 parse 가능한 JSON 형식으로 stdout에 출력한다', async () => {
            const res = await runCliWithSpies(['--json', 'resolve', '서울역'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockResolvedValue(mockPlace)
            })
            expect(res.exitCode).toBe(0)
           const parsedJson = JSON.parse(res.stdout.trim())
           const parsed: Place = parsedJson
            expect(parsed.name).toBe('서울역')
            expect(parsed.address).toBe('서울특별시 중구 봉래동2가 122')
            expect(parsed.provider).toBe('kakao')
        })
    })

    describe('7. Negative numeric coordinates handling', () => {
        const mockNearbyOutput: Place[] = [
            {
                name: '음수좌표장소',
                address: '음수동',
                roadAddress: '음수길',
                lat: -37.556,
                lng: -126.972,
                provider: 'kakao',
                raw: {},
            },
        ]

        it('음수 좌표값(-37.556, -126.972)을 옵션이 아닌 숫자로 인식하여 정상 실행한다', async () => {
            const res = await runCliWithSpies(['nearby', '-37.556', '-126.972', '카페', '1000'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'searchNearby').mockResolvedValue(mockNearbyOutput)
            })
            expect(res.exitCode).toBe(0)
            expect(res.stdout).toContain('Name: 음수좌표장소')
        })
    })

    describe('8. Option boundary (--) handling', () => {
        const mockPlace: Place = {
            name: '--json',
            address: '경계로',
            roadAddress: '경계길',
            lat: 37.5,
            lng: 126.8,
            provider: 'kakao',
            raw: {},
        }

        it('-- 경계 뒤의 --json 인수는 옵션이 아니라 positional 검색어로 처리된다', async () => {
            let resolvedQuery = ''
            const res = await runCliWithSpies(['resolve', '--', '--json'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockImplementation((q) => {
                    resolvedQuery = q
                    return Promise.resolve(mockPlace)
                })
            })
            expect(res.exitCode).toBe(0)
            expect(resolvedQuery).toBe('--json')
            // output format should be human (not JSON) because --json is treated as positional
            expect(res.stdout).toContain('Name: --json')
            expect(() => JSON.parse(res.stdout.trim())).toThrow()
        })
    })

    describe('9. Named option precedence & arity verification', () => {
        const mockPlace: Place = {
            name: '우선순위장소',
            address: '우선로',
            roadAddress: '우선길',
            lat: 37.5,
            lng: 126.8,
            provider: 'kakao',
            raw: {},
        }

        const mockGeo: GeoResult = {
            lat: 37.5,
            lng: 126.8,
            provider: 'kakao',
            raw: {},
        }

        it('resolve에서 named 옵션(--query)이 positional 인수보다 높은 우선순위를 가진다', async () => {
            let resolvedQuery = ''
            const res = await runCliWithSpies(['resolve', '--query', '네임드쿼리', '포지셔널쿼리'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'resolve').mockImplementation((q) => {
                    resolvedQuery = q
                    return Promise.resolve(mockPlace)
                })
            })
            expect(res.exitCode).toBe(0)
            expect(resolvedQuery).toBe('네임드쿼리')
        })

        it('geocode에서 named 옵션(--address)이 positional 인수보다 높은 우선순위를 가진다', async () => {
            let resolvedAddress = ''
            const res = await runCliWithSpies(['geocode', '--address', '네임드주소', '포지셔널주소'], ({ KakaoVendor }) => {
                jest.spyOn(KakaoVendor.prototype, 'geocode').mockImplementation((addr) => {
                    resolvedAddress = addr
                    return Promise.resolve(mockGeo)
                })
            })
            expect(res.exitCode).toBe(0)
            expect(resolvedAddress).toBe('네임드주소')
        })
    })
})
