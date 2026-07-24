import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { z } from 'zod'
import { McpException } from 'zido/common'
import { PlaceService } from 'zido/place-domain'
import { CliAppModule } from './app.module'
import { executeGeocodeCommand, GeocodeCommandInputSchema } from './commands/geocode.command'
import type { GeocodeCommandInput } from './commands/geocode.command'
import { executeNearbyCommand, NearbyCommandInputSchema } from './commands/nearby.command'
import type { NearbyCommandInput } from './commands/nearby.command'
import { executeResolveCommand, ResolveCommandInputSchema } from './commands/resolve.command'
import type { ResolveCommandInput } from './commands/resolve.command'

/**
 * Direct domain CLI가 노출하는 command 이름을 제한한다.
 */
const CliCommandSchema = z.enum(['resolve', 'nearby', 'geocode'])
/**
 * Parser와 command dispatch가 공유하는 command 이름이다.
 */
type CliCommand = z.infer<typeof CliCommandSchema>
/**
 * Command별 Zod input을 domain 호출 직전까지 보존한다.
 */
type CommandInput = ResolveCommandInput | NearbyCommandInput | GeocodeCommandInput

/**
 * Human과 machine mode가 공유하는 안정적 error payload다.
 */
const CliErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string(),
})
/**
 * 공개 error envelope의 검증된 payload다.
 */
type CliError = z.infer<typeof CliErrorSchema>

/**
 * Shell argv를 정규화한 parser 결과를 검증한다.
 */
const ParsedArgumentsSchema = z.object({
  command: CliCommandSchema.nullable(),
  json: z.boolean(),
  help: z.boolean(),
  version: z.boolean(),
  positional: z.array(z.string()),
  options: z.record(z.string(), z.string()),
})
/**
 * 검증을 마친 command, flags, operands 묶음이다.
 */
type ParsedArguments = z.infer<typeof ParsedArgumentsSchema>

/**
 * 운영자가 첫 실행만으로 command 입력과 설정을 이해할 수 있는 도움말을 만든다.
 */
function usage(command: CliCommand | null = null): string {
  const shared = [
    '',
    'Output:',
    '  기본 출력은 각 결과 field를 label과 함께 여러 줄로 펼칩니다.',
    '  --json은 같은 결과를 parse-clean JSON으로 stdout에 출력합니다.',
    '  Spreading 예시: Name: 서울역',
    '  JSON 예시: {"name":"서울역","provider":"kakao"}',
    '',
    'Configuration:',
    '  .env에 KAKAO_REST_KEY, NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 또는 GOOGLE_API_KEY를 설정하세요.',
    '  PROVIDER_ORDER로 사용할 provider 순서를 지정할 수 있습니다.',
  ]
  const commandUsage: Record<CliCommand, readonly string[]> = {
    resolve: [
      'Usage:',
      '  zido [--json] resolve <query>',
      '  zido [--json] resolve --query <query>',
      '',
      'Input:',
      '  query는 비어 있지 않은 장소 검색어 하나여야 합니다.',
      '',
      'Examples:',
      '  zido resolve "서울역 카페"',
      '  zido --json resolve --query "서울역"',
    ],
    nearby: [
      'Usage:',
      '  zido [--json] nearby <lat> <lng> <keyword> <radius>',
      '  zido [--json] nearby --lat <lat> --lng <lng> --keyword <keyword> --radius <meters>',
      '',
      'Input:',
      '  lat -90..90, lng -180..180, radius는 0보다 크고 50000 이하이며 positional과 named input을 섞지 않습니다.',
      '',
      'Examples:',
      '  zido nearby --lat 37.556 --lng 126.972 --keyword "카페" --radius 1000',
      '  zido --json nearby 37.556 126.972 "카페" 1000',
    ],
    geocode: [
      'Usage:',
      '  zido [--json] geocode <address>',
      '  zido [--json] geocode --address <address>',
      '',
      'Input:',
      '  address는 비어 있지 않은 주소 하나여야 합니다.',
      '',
      'Examples:',
      '  zido geocode "서울특별시 중구 한강대로 405"',
      '  zido --json geocode --address "서울역"',
    ],
  }
  if (command) {
    return [
      ...commandUsage[command],
      ...shared,
      '',
      'Options:',
      '  --json  JSON 결과 출력',
      '  -h, --help  command 도움말 출력',
    ].join('\n')
  }
  return [
    'Zido는 여러 지도 provider를 공통 interface로 사용하는 장소 검색 CLI입니다.',
    '',
    'Usage:',
    '  zido [--json] <command> [arguments]',
    '',
    'Input:',
    '  <command>에 resolve, nearby 또는 geocode를 지정합니다.',
    '  command별 argument와 제약은 zido <command> --help에서 확인합니다.',
    '',
    'Commands:',
    '  zido resolve "query"',
    '  zido nearby --lat <lat> --lng <lng> --keyword <keyword> --radius <meters>',
    '  zido geocode "address"',
    '',
    'Examples:',
    '  zido resolve "서울역 카페"',
    '  zido nearby --lat 37.556 --lng 126.972 --keyword "카페" --radius 1000',
    '  zido geocode "서울특별시 중구 한강대로 405"',
    ...shared,
    '',
    'Options:',
    '  --json         JSON 결과 출력',
    '  -h, --help     사용법 출력',
    '  -v, --version  package version 출력',
  ].join('\n')
}

/**
 * Repository package metadata를 version의 유일한 source로 읽는다.
 */
function packageVersion(): string {
  const metadata = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as unknown
  return z.object({ version: z.string() }).parse(metadata).version
}

/**
 * CLI 경계에서 안정적인 code와 remediation을 공유하는 exception을 만든다.
 */
function cliFailure(code: string, message: string, hint: string): McpException {
  const failure = new McpException(message, code)
  Object.assign(failure, { hint })
  return failure
}

/**
 * 음수 숫자는 operand로 보존하면서 option 형태를 구분한다.
 */
function isOptionLikeToken(token: string): boolean {
  if (!token.startsWith('-') || token === '-') return false
  return !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)
}

/**
 * Parse 실패 시에도 end-of-options 경계를 지켜 JSON error mode를 판별한다.
 */
function hasJsonOption(argv: readonly string[]): boolean {
  const boundary = argv.indexOf('--')
  const optionTokens = boundary === -1 ? argv : argv.slice(0, boundary)
  return optionTokens.includes('--json')
}

/**
 * Shell argv를 command, named option, positional argument로 분리한다.
 */
function parseArguments(argv: readonly string[]): ParsedArguments {
  const positional: string[] = []
  const options: Record<string, string> = {}
  let command: CliCommand | null = null
  let json = false
  let help = false
  let version = false
  let endOfOptions = false

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!endOfOptions && token === '--') {
      endOfOptions = true
      continue
    }
    if (!endOfOptions && token === '--json') {
      json = true
      continue
    }
    if (!endOfOptions && (token === '--help' || token === '-h')) {
      help = true
      continue
    }
    if (!endOfOptions && (token === '--version' || token === '-v')) {
      version = true
      continue
    }
    if (!endOfOptions && token.startsWith('--')) {
      const option = token.slice(2)
      const value = argv[index + 1]
      if (!value || value === '--' || isOptionLikeToken(value)) {
        throw cliFailure(
          'CLI_USAGE',
          `--${option} option 값이 필요합니다.`,
          `zido ${command ?? ''} --help를 확인하세요.`,
        )
      }
      options[option] = value
      index += 1
      continue
    }
    if (!endOfOptions && isOptionLikeToken(token)) {
      throw cliFailure(
        'CLI_USAGE',
        `지원하지 않는 option입니다: ${token}`,
        `zido ${command ?? ''} --help를 확인하세요.`,
      )
    }
    if (!command) {
      const parsedCommand = CliCommandSchema.safeParse(token)
      if (parsedCommand.success) {
        command = parsedCommand.data
        continue
      }
      throw cliFailure('CLI_USAGE', `알 수 없는 command입니다: ${token}`, 'zido --help에서 지원 command를 확인하세요.')
    }
    positional.push(token)
  }

  return ParsedArgumentsSchema.parse({
    command,
    json,
    help,
    version,
    positional,
    options,
  })
}

/**
 * Named option과 positional argument를 command별 Zod input으로 결합한다.
 */
function readCommandInput(parsed: ParsedArguments): CommandInput {
  const allowedOptions = {
    resolve: ['query'],
    nearby: ['lat', 'lng', 'keyword', 'radius'],
    geocode: ['address'],
  } as const
  if (parsed.command === null) {
    throw cliFailure('CLI_USAGE', 'command가 필요합니다.', 'zido --help에서 사용법을 확인하세요.')
  }
  const allowed = allowedOptions[parsed.command]
  const unknownOption = Object.keys(parsed.options).find((key) => !allowed.some((option) => option === key))
  if (unknownOption) {
    throw cliFailure(
      'CLI_USAGE',
      `${parsed.command}에서 지원하지 않는 option입니다: --${unknownOption}`,
      `zido ${parsed.command} --help를 확인하세요.`,
    )
  }

  switch (parsed.command) {
    case 'resolve':
      if (parsed.positional.length > 1) {
        throw cliFailure('CLI_USAGE', 'resolve는 query 하나만 받습니다.', '공백을 포함한 query는 따옴표로 감싸세요.')
      }
      return ResolveCommandInputSchema.parse({
        query: parsed.options.query ?? parsed.positional[0],
      })
    case 'nearby': {
      const hasNamedInput = Object.keys(parsed.options).length > 0
      if (parsed.positional.length > 0 && hasNamedInput) {
        throw cliFailure(
          'CLI_USAGE',
          'nearby positional과 named input을 함께 사용할 수 없습니다.',
          '한 가지 input 형식만 사용하세요.',
        )
      }
      if (!hasNamedInput && parsed.positional.length !== 4) {
        throw cliFailure(
          'CLI_USAGE',
          'nearby positional input은 lat, lng, keyword, radius 네 값이 필요합니다.',
          'zido nearby --help에서 input 형식을 확인하세요.',
        )
      }
      return NearbyCommandInputSchema.parse({
        lat: Number(parsed.options.lat ?? parsed.positional[0]),
        lng: Number(parsed.options.lng ?? parsed.positional[1]),
        keyword: parsed.options.keyword ?? parsed.positional[2],
        radiusM: Number(parsed.options.radius ?? parsed.positional[3]),
      })
    }
    case 'geocode':
      if (parsed.positional.length > 1) {
        throw cliFailure(
          'CLI_USAGE',
          'geocode는 address 하나만 받습니다.',
          '공백을 포함한 address는 따옴표로 감싸세요.',
        )
      }
      return GeocodeCommandInputSchema.parse({
        address: parsed.options.address ?? parsed.positional[0],
      })
  }
}

/**
 * Object field를 사람이 식별할 수 있는 title label과 JSON-safe 값으로 펼친다.
 */
function formatFields(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).map(([key, field]) => {
    const label = key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())
    const rendered = typeof field === 'object' ? JSON.stringify(field) : String(field)
    return `${prefix}${label}: ${rendered}`
  })
}

/**
 * Domain 결과를 human-readable 또는 JSON contract로 stdout에 기록한다.
 */
function printResult(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return
  }
  const collection = z
    .object({
      items: z.array(z.record(z.string(), z.unknown())),
    })
    .safeParse(value)
  if (collection.success) {
    const { items } = collection.data
    const output = items
      .map((item, index) => [`Result ${index + 1}`, ...formatFields(item, '  ')].join('\n'))
      .join('\n\n')
    process.stdout.write(`${output}\n`)
    return
  }
  process.stdout.write(`${formatFields(value as Record<string, unknown>).join('\n')}\n`)
}

/**
 * Command 결과가 장소를 포함하지 않는 outcome인지 판별한다.
 */
function isNoResult(value: unknown): boolean {
  if (value === null) return true
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray(value.items) &&
    value.items.length === 0
  )
}

/**
 * Exception을 공개 exit contract와 remediation payload로 정규화한다.
 */
function normalizeFailure(error: unknown): {
  failure: CliError
  exitCode: number
} {
  if (error instanceof McpException) {
    const configurationCodes: Record<string, true> = {
      NO_PROVIDER_CONFIGURED: true,
      MISSING_API_KEY: true,
      AUTHENTICATION_FAILED: true,
      UNAUTHORIZED: true,
    }
    const isUsage = error.code === 'CLI_USAGE'
    const isConfiguration = configurationCodes[error.code] === true
    const hint =
      'hint' in error
        ? String(error.hint)
        : isConfiguration
          ? 'provider API key와 PROVIDER_ORDER를 .env에서 확인하세요.'
          : 'provider 상태와 network 연결을 확인한 뒤 다시 시도하세요.'
    return {
      failure: CliErrorSchema.parse({
        code: error.code,
        message: error.message,
        hint,
      }),
      exitCode: isUsage ? 2 : isConfiguration ? 3 : 4,
    }
  }
  if (error instanceof z.ZodError) {
    return {
      failure: {
        code: 'CLI_USAGE',
        message: error.issues[0]?.message ?? '입력값이 올바르지 않습니다.',
        hint: '해당 command의 --help에서 input 제약을 확인하세요.',
      },
      exitCode: 2,
    }
  }
  return {
    failure: {
      code: 'CLI_RUNTIME',
      message: error instanceof Error ? error.message : String(error),
      hint: 'provider 상태와 network 연결을 확인한 뒤 다시 시도하세요.',
    },
    exitCode: 4,
  }
}

/**
 * Error mode에 맞춰 stderr에 human 진단 또는 JSON envelope를 기록한다.
 */
function printFailure(failure: CliError, json: boolean): void {
  process.stderr.write(
    json ? `${JSON.stringify(failure)}\n` : `Error [${failure.code}]: ${failure.message}\nHint: ${failure.hint}\n`,
  )
}

/**
 * Nest context 안에서 domain command를 실행하고 outcome을 exit contract로 변환한다.
 */
async function runDomainCommand(parsed: ParsedArguments, input: CommandInput): Promise<number> {
  let context: INestApplicationContext | undefined
  try {
    context = await NestFactory.createApplicationContext(CliAppModule, {
      logger: false,
    })
    const service = context.get(PlaceService)
    let result: unknown
    switch (parsed.command) {
      case 'resolve':
        result = await executeResolveCommand(service, ResolveCommandInputSchema.parse(input))
        break
      case 'nearby':
        result = await executeNearbyCommand(service, NearbyCommandInputSchema.parse(input))
        break
      case 'geocode':
        result = await executeGeocodeCommand(service, GeocodeCommandInputSchema.parse(input))
        break
      case null:
        throw cliFailure('CLI_USAGE', 'command가 필요합니다.', 'zido --help에서 사용법을 확인하세요.')
    }
    if (isNoResult(result)) {
      printFailure(
        {
          code: 'NO_RESULT',
          message: '검색 결과가 없습니다.',
          hint: '검색어 또는 검색 범위를 바꿔 다시 시도하세요.',
        },
        parsed.json,
      )
      return 5
    }
    printResult(result, parsed.json)
    return 0
  } catch (error) {
    const { failure, exitCode } = normalizeFailure(error)
    printFailure(failure, parsed.json)
    return exitCode
  } finally {
    await context?.close()
  }
}

/**
 * CLI lifecycle을 실행하고 공개 exit code를 반환한다.
 */
async function run(): Promise<number> {
  let parsed: ParsedArguments | undefined
  try {
    parsed = parseArguments(process.argv.slice(2))
    if (process.argv.length === 2) {
      process.stdout.write(`${usage()}\n`)
      return 0
    }
    if (parsed.help) {
      process.stdout.write(`${usage(parsed.command)}\n`)
      return 0
    }
    if (parsed.version) {
      process.stdout.write(`${packageVersion()}\n`)
      return 0
    }
    const input = readCommandInput(parsed)
    return await runDomainCommand(parsed, input)
  } catch (error) {
    const { failure, exitCode } = normalizeFailure(error)
    printFailure(failure, parsed?.json ?? hasJsonOption(process.argv.slice(2)))
    return exitCode
  }
}

void run().then((code) => {
  process.exitCode = code
})

export default run
