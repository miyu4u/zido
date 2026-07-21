import 'reflect-metadata'
import { z } from 'zod'
import { NestFactory } from '@nestjs/core'
import type { INestApplicationContext } from '@nestjs/common'
import { config, logger } from 'zido/configuration'
import { PlaceService } from 'zido/place-domain'
import { CliAppModule } from './app.module'
import {
    executeGeocodeCommand,
    GeocodeCommandInputSchema,
} from './commands/geocode.command'
import {
    executeNearbyCommand,
    NearbyCommandInputSchema,
} from './commands/nearby.command'
import {
    executeResolveCommand,
    ResolveCommandInputSchema,
} from './commands/resolve.command'
import type { ResolveCommandInput } from './commands/resolve.command'
import type { NearbyCommandInput } from './commands/nearby.command'
import type { GeocodeCommandInput } from './commands/geocode.command'

/**
 * direct domain CLI가 노출하는 세 가지 command 이름을 제한한다.
 */
const CliCommandSchema = z.enum(['resolve', 'nearby', 'geocode'])

/**
 * parser가 반환하는 command 이름의 정적 타입이다.
 */
type CliCommand = z.infer<typeof CliCommandSchema>

/**
 * command별 Zod input을 domain 호출 직전까지 보존한다.
 */
type CommandInput = ResolveCommandInput | NearbyCommandInput | GeocodeCommandInput

/**
 * CLI가 지원하는 옵션과 위치 인자의 정규화 결과를 정의한다.
 */
const ParsedArgumentsSchema = z.object({
    command: CliCommandSchema.nullable(),
    json: z.boolean(),
    help: z.boolean(),
    version: z.boolean(),
    positional: z.array(z.string()),
    options: z.record(z.string(), z.string()),
})

type ParsedArguments = z.infer<typeof ParsedArgumentsSchema>

/**
 * 운영자가 바로 확인할 수 있는 command 사용법을 반환한다.
 */
function usage(): string {
    return [
        'Usage:',
        '  zido [--json] <command> [arguments]',
        '',
        'Commands:',
        '  zido resolve "query"',
        '  zido nearby --lat <lat> --lng <lng> --keyword <keyword> --radius <meters>',
        '  zido geocode "address"',
        '',
        'Options:',
        '  --json     JSON 결과 출력',
        '  --help     사용법 출력',
        '  --version  version 출력',
    ].join('\n')
}

/**
 * shell argv를 command, named option, positional argument로 분리한다.
 */
function parseArguments(argv: readonly string[]): ParsedArguments {
    const positional: string[] = []
    const options: Record<string, string> = {}
    let command: CliCommand | null = null
    let json = false
    let help = false
    let version = false

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (token === '--json') {
            json = true
            continue
        }
        if (token === '--help' || token === '-h') {
            help = true
            continue
        }
        if (token === '--version' || token === '-v') {
            version = true
            continue
        }
        if (token.startsWith('--')) {
            const option = token.slice(2)
            const value = argv[index + 1]
            if (!value || value.startsWith('-')) {
                throw new Error(`Missing value for --${option}`)
            }
            options[option] = value
            index += 1
            continue
        }
        if (!command) {
            const parsedCommand = CliCommandSchema.safeParse(token)
            if (parsedCommand.success) {
                command = parsedCommand.data
                continue
            }
            throw new Error(`Unknown command: ${token}`)
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
 * named option과 positional argument를 command별 입력으로 결합한다.
 */
function readCommandInput(parsed: ParsedArguments): CommandInput {
    const allowedOptions = {
        resolve: ['query'],
        nearby: ['lat', 'lng', 'keyword', 'radius'],
        geocode: ['address'],
    } as const
    if (parsed.command === null) {
        throw new Error('A command is required')
    }
    const allowed = allowedOptions[parsed.command]
    const unknownOption = Object.keys(parsed.options).find((key) => !allowed.some((option) => option === key))
    if (unknownOption) {
        throw new Error(`Unknown option for ${parsed.command}: --${unknownOption}`)
    }

    switch (parsed.command) {
        case 'resolve':
            if (parsed.positional.length > 1) throw new Error('resolve accepts one query')
            return ResolveCommandInputSchema.parse({
                query: parsed.options.query ?? parsed.positional[0],
            })
        case 'nearby':
            if (parsed.positional.length > 0 && Object.keys(parsed.options).length > 0) {
                throw new Error('nearby uses either positional or named arguments')
            }
            return NearbyCommandInputSchema.parse({
                lat: Number(parsed.options.lat ?? parsed.positional[0]),
                lng: Number(parsed.options.lng ?? parsed.positional[1]),
                keyword: parsed.options.keyword ?? parsed.positional[2],
                radiusM: Number(parsed.options.radius ?? parsed.positional[3]),
            })
        case 'geocode':
            if (parsed.positional.length > 1) throw new Error('geocode accepts one address')
            return GeocodeCommandInputSchema.parse({
                address: parsed.options.address ?? parsed.positional[0],
            })
    }
}

/**
 * domain 결과를 human-readable 또는 JSON contract로 stdout에 기록한다.
 */
function printResult(value: unknown, json: boolean): void {
    if (json) {
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
        return
    }
    if (value === null) {
        process.stdout.write('not found\n')
        return
    }
    if (typeof value === 'object' && value !== null && 'items' in value) {
        const items = (value as { items: readonly { name: string; distanceM: number }[] }).items
        process.stdout.write(
            `${items.map((item) => `${item.name}\t${item.distanceM}m`).join('\n')}\n`,
        )
        return
    }
    process.stdout.write(`${JSON.stringify(value)}\n`)
}

/**
 * CLI lifecycle을 실행하고 명세의 exit code를 반환한다.
 */
async function run(): Promise<number> {
    let parsed: ParsedArguments
    try {
        parsed = parseArguments(process.argv.slice(2))
        if (parsed.help) {
            process.stdout.write(`${usage()}\n`)
            return 0
        }
        if (parsed.version) {
            process.stdout.write(`${config.server.version}\n`)
            return 0
        }
        const input = readCommandInput(parsed)
        return await runDomainCommand(parsed, input)
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 2
    }
}

/**
 * Nest context 안에서 domain command를 실행하고 runtime 오류를 구분한다.
 */
async function runDomainCommand(parsed: ParsedArguments, input: CommandInput): Promise<number> {
    let context: INestApplicationContext | undefined
    try {
        context = await NestFactory.createApplicationContext(CliAppModule, { logger: false })
        const service = context.get(PlaceService)
        switch (parsed.command) {
            case 'resolve':
                printResult(
                    await executeResolveCommand(
                        service,
                        ResolveCommandInputSchema.parse(input),
                    ),
                    parsed.json,
                )
                break
            case 'nearby':
                printResult(
                    await executeNearbyCommand(
                        service,
                        NearbyCommandInputSchema.parse(input),
                    ),
                    parsed.json,
                )
                break
            case 'geocode':
                printResult(
                    await executeGeocodeCommand(
                        service,
                        GeocodeCommandInputSchema.parse(input),
                    ),
                    parsed.json,
                )
                break
            case null:
                throw new Error('A command is required')
        }
        return 0
    } catch (error) {
        logger.error({ error }, 'CLI command failed')
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 1
    } finally {
        await context?.close()
    }
}

void run().then((code) => {
    process.exitCode = code
})

export default run
