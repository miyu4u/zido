/**
 * stdio 모드 e2e 테스트
 * 실제 JSON-RPC 2.0 프로토콜을 사용하여 통신을 테스트합니다.
 */
import { ChildProcess, spawn } from 'child_process'
import * as path from 'path'

describe('STDIO(e2e)', () => {
    let serverProcess: ChildProcess | null = null
    let requestId = 0
    let stdoutBuffer = ''

    // 각 테스트 전에 서버 프로세스 시작
    beforeEach(async () => {
        requestId = 0
        stdoutBuffer = ''
        const serverPath = path.resolve(__dirname, '../app/stdio.ts')
        serverProcess = spawn('tsx', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.resolve(__dirname, '../..'),
        })

        // stdout 버퍼링 설정
        if (serverProcess.stdout) {
            serverProcess.stdout.on('data', (data: Buffer) => {
                stdoutBuffer += data.toString()
            })
        }

        // stderr는 로그로 출력 (디버깅용)
        if (serverProcess.stderr) {
            serverProcess.stderr.on('data', (data: Buffer) => {
                // 디버깅: stderr 출력 확인
                const log = data.toString()
                if (log.includes('error') || log.includes('Error')) {
                    console.error('[SERVER STDERR]', log)
                }
            })
        }

        // 프로세스 에러 핸들러
        serverProcess.on('error', (error) => {
            console.error('[SERVER ERROR]', error)
        })

        // 서버가 준비될 때까지 대기
        await new Promise((resolve) => setTimeout(resolve, 2000))
    })

    // 각 테스트 후에 서버 프로세스 종료
    afterEach(async () => {
        if (serverProcess) {
            if (serverProcess.stdin && !serverProcess.stdin.destroyed) {
                serverProcess.stdin.end()
            }
            if (!serverProcess.killed) {
                try {
                    serverProcess.kill('SIGTERM')
                } catch (error) {
                    // 프로세스가 이미 종료된 경우 무시
                }
            }
            await new Promise<void>((resolve) => {
                if (serverProcess) {
                    const timeout = setTimeout(() => {
                        if (serverProcess && !serverProcess.killed) {
                            serverProcess.kill('SIGKILL')
                        }
                        resolve()
                    }, 2000)

                    serverProcess.on('exit', () => {
                        clearTimeout(timeout)
                        resolve()
                    })

                    // 이미 종료된 경우
                    if (serverProcess.killed) {
                        clearTimeout(timeout)
                        resolve()
                    }
                } else {
                    resolve()
                }
            })
            serverProcess = null
            stdoutBuffer = ''
        }
    })

    /**
     * JSON-RPC 2.0 요청 전송 헬퍼
     */
    async function sendRequest(method: string, params?: unknown): Promise<unknown> {
        if (!serverProcess || !serverProcess.stdin || !serverProcess.stdout) {
            throw new Error('Server process not initialized')
        }

        const id = ++requestId
        const request = {
            jsonrpc: '2.0',
            method,
            params: params || {},
            id,
        }

        // 기존 버퍼 초기화 (이전 응답 제거)
        stdoutBuffer.length

        // 요청 전송
        const requestStr = JSON.stringify(request) + '\n'
        if (serverProcess.stdin.writable) {
            serverProcess.stdin.write(requestStr, (err) => {
                if (err) {
                    console.error('[WRITE ERROR]', err)
                }
            })
        } else {
            throw new Error('stdin is not writable')
        }

        // 응답 수신 (stdout에서 JSON-RPC 응답 읽기)
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                // 타임아웃 시 현재 버퍼 내용 출력 (디버깅)
                console.error(`[TIMEOUT] Method: ${method}, ID: ${id}`)
                console.error(`[BUFFER] ${stdoutBuffer}`)
                reject(new Error(`Request timeout for method: ${method} (id: ${id})`))
            }, 15000)

            // stdout에서 직접 읽기 (이벤트 기반)
            const onData = (data: Buffer) => {
                const text = data.toString()
                stdoutBuffer += text
                const lines = text.split('\n').filter((line) => line.trim())

                for (const line of lines) {
                    try {
                        const response = JSON.parse(line)
                        console.log(response)
                        if (response.jsonrpc === '2.0' && response.id === id) {
                            clearTimeout(timeout)
                            if (serverProcess?.stdout) {
                                serverProcess.stdout.removeListener('data', onData)
                            }
                            if (response.error) {
                                reject(new Error(`JSON-RPC error: ${response.error.code} - ${response.error.message}`))
                            } else {
                                resolve(response.result)
                            }
                            return
                        }
                    } catch (e) {
                        // JSON 파싱 실패는 무시 (로그 등일 수 있음)
                    }
                }
            }

            if (serverProcess?.stdout) {
                serverProcess?.stdout?.on('data', onData)
            }
        })
    }

    describe('JSON-RPC 2.0 프로토콜', () => {
        // MCP 프로토콜은 initialize가 먼저 필요
        let initialized = false

        beforeEach(async () => {
            if (!initialized) {
                // initialize 요청
                await sendRequest('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'test-client',
                        version: '1.0.0',
                    },
                })
                initialized = true
                // initialized 알림 대기
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
        })

        it('initialize 요청을 처리해야 함', async () => {
            const result = await sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'test-client',
                    version: '1.0.0',
                },
            })

            expect(result).toBeDefined()
            expect(result).toHaveProperty('protocolVersion')
            expect(result).toHaveProperty('capabilities')
            expect(result).toHaveProperty('serverInfo')
        }, 20000)

        it('tools/list 요청을 처리해야 함', async () => {
            const result = (await sendRequest('tools/list')) as { tools: unknown[] }

            expect(result).toBeDefined()
            expect(result.tools).toBeInstanceOf(Array)
            expect(result.tools.length).toBeGreaterThan(0)

            // 등록된 도구 확인
            const toolNames = result.tools.map((tool: any) => tool.name)
            expect(toolNames).toContain('place_resolve')
            expect(toolNames).toContain('place_search_nearby')
            expect(toolNames).toContain('place_geocode')
        }, 20000)

        it('tools/call 요청을 처리해야 함', async () => {
            // place_resolve 도구 호출
            const result = (await sendRequest('tools/call', {
                name: 'place_resolve',
                arguments: {
                    query: '서울역 스타벅스',
                },
            })) as { content: Array<{ type: string; text: string }> }

            expect(result).toBeDefined()
            expect(result.content).toBeInstanceOf(Array)
            expect(result.content.length).toBeGreaterThan(0)
            expect(result.content[0]).toHaveProperty('type', 'text')
            expect(result.content[0]).toHaveProperty('text')

            // JSON 응답 파싱 가능한지 확인
            const parsed = JSON.parse(result?.content?.[0]?.text || '')
            console.log(parsed)
            expect(parsed).toBeDefined()
        }, 20000)

        it('잘못된 도구 이름으로 호출 시 에러를 반환해야 함', async () => {
            const result = (await sendRequest('tools/call', {
                name: 'unknown_tool',
                arguments: {},
            })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

            expect(result).toBeDefined()
            expect(result.isError).toBe(true)
            expect(result.content).toBeInstanceOf(Array)
            expect(result.content?.[0]?.text).toContain('Unknown tool')
        }, 20000)

        it('잘못된 파라미터로 호출 시 에러를 반환해야 함', async () => {
            const result = (await sendRequest('tools/call', {
                name: 'place_resolve',
                arguments: {
                    // query 필수 파라미터 누락
                },
            })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

            expect(result).toBeDefined()
            expect(result.isError).toBe(true)
            expect(result.content).toBeInstanceOf(Array)
            expect(result.content?.[0]?.text).toContain('Error')
        }, 20000)
    })

    describe('MCP 프로토콜 준수', () => {
        let initialized = false

        beforeEach(async () => {
            if (!initialized) {
                await sendRequest('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'test-client',
                        version: '1.0.0',
                    },
                })
                initialized = true
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
        })

        it('JSON-RPC 2.0 형식을 정확히 따라야 함', async () => {
            if (!serverProcess || !serverProcess.stdin || !serverProcess.stdout) {
                throw new Error('Server process not initialized')
            }

            const id = 999
            const request = {
                jsonrpc: '2.0',
                method: 'tools/list',
                id,
            }

            serverProcess.stdin.write(JSON.stringify(request) + '\n')

            const response = await new Promise<{ jsonrpc: string; result?: unknown; error?: unknown; id: number }>(
                (resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Request timeout'))
                    }, 10000)

                    const onData = (data: Buffer) => {
                        const lines = data
                            .toString()
                            .split('\n')
                            .filter((line) => line.trim())
                        for (const line of lines) {
                            try {
                                const parsed = JSON.parse(line)
                                if (parsed.id === id) {
                                    clearTimeout(timeout)
                                    serverProcess?.stdout?.removeListener('data', onData)
                                    resolve(parsed)
                                    return
                                }
                            } catch (e) {
                                // JSON 파싱 실패는 무시
                            }
                        }
                    }

                    serverProcess?.stdout?.on('data', onData)
                },
            )

            // JSON-RPC 2.0 형식 검증
            expect(response).toHaveProperty('jsonrpc', '2.0')
            expect(response).toHaveProperty('id', id)
            expect(response).toHaveProperty('result')
            expect(response.result).toBeDefined()
        }, 20000)

        it('여러 요청을 순차적으로 처리해야 함', async () => {
            const result1 = await sendRequest('tools/list')
            const result2 = await sendRequest('tools/list')

            expect(result1).toBeDefined()
            expect(result2).toBeDefined()
            expect(result1).toEqual(result2)
        }, 20000)
    })

    describe('도구 실행', () => {
        let initialized = false

        beforeEach(async () => {
            if (!initialized) {
                await sendRequest('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'test-client',
                        version: '1.0.0',
                    },
                })
                initialized = true
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
        })

        it('place_resolve 도구를 실행할 수 있어야 함', async () => {
            const result = (await sendRequest('tools/call', {
                name: 'place_resolve',
                arguments: {
                    query: '서울역 스타벅스',
                },
            })) as { content: Array<{ type: string; text: string }> }

            expect(result?.content?.[0]?.text).toBeDefined()
            const parsed = JSON.parse(result?.content?.[0]?.text || '')
            console.log(parsed)
            expect(parsed).toHaveProperty('name')
        }, 20000)

        it('place_search_nearby 도구를 실행할 수 있어야 함', async () => {
            const result = (await sendRequest('tools/call', {
                name: 'place_search_nearby',
                arguments: {
                    center: {
                        lat: 37.5539,
                        lng: 126.9728,
                    },
                    keyword: '스타벅스',
                    radiusM: 500,
                },
            })) as { content: Array<{ type: string; text: string }> }

            expect(result?.content?.[0]?.text).toBeDefined()
            const parsed = JSON.parse(result?.content?.[0]?.text || '')
            console.log(parsed)
            expect(parsed).toHaveProperty('items')
            expect(Array.isArray(parsed.items)).toBe(true)
        }, 20000)

        it('place_geocode 도구를 실행할 수 있어야 함', async () => {
            const result = (await sendRequest('tools/call', {
                name: 'place_geocode',
                arguments: {
                    address: '서울특별시 중구 한강대로 405',
                },
            })) as { content: Array<{ type: string; text: string }> }

            expect(result?.content?.[0]?.text).toBeDefined()
            const parsed = JSON.parse(result?.content?.[0]?.text || '')
            console.log(parsed)
            expect(parsed).toHaveProperty('lat')
            expect(parsed).toHaveProperty('lng')
        }, 20000)
    })
})
