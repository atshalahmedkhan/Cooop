import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const RUNNER_PATH = join(__dir, 'runner.py')

const HARD_TIMEOUT_MS = 5_000   // wall-clock kill timeout
const SOFT_TIMEOUT_MS = 3_000   // used by Python resource module (passed via env)
const OUTPUT_LIMIT = 64 * 1024  // 64 KB total stdout before SIGKILL

export interface TestCase {
  input: string           // Python statement to call the student's code
  expected_output: string
  is_hidden: boolean
  hint?: string
}

export interface TestResult {
  passed: boolean
  output: string
  expected: string        // empty for hidden tests
  hidden: boolean
  error: string | null
  hint?: string
}

export interface ExecutionResult {
  results: TestResult[]
  error: string | null
  timedOut: boolean
}

function timeoutResults(tests: TestCase[], mode: 'run' | 'submit'): TestResult[] {
  return tests
    .filter(t => !(t.is_hidden && mode !== 'submit'))
    .map(t => ({
      passed: false,
      output: '',
      expected: t.is_hidden ? '' : t.expected_output,
      hidden: t.is_hidden,
      error: 'Execution timed out (possible infinite loop)',
      hint: undefined,
    }))
}

export function execPython(
  code: string,
  tests: TestCase[],
  mode: 'run' | 'submit',
): Promise<ExecutionResult> {
  return new Promise(resolve => {
    const payload = JSON.stringify({ code, tests, mode })

    const child = spawn('python3', [RUNNER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: '' },
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.length > OUTPUT_LIMIT) {
        killed = true
        child.kill('SIGKILL')
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString().slice(0, 1_000)
    })

    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, HARD_TIMEOUT_MS)

    child.on('close', () => {
      clearTimeout(timer)

      if (killed) {
        resolve({
          results: timeoutResults(tests, mode),
          error: 'Execution timed out',
          timedOut: true,
        })
        return
      }

      try {
        const parsed = JSON.parse(stdout.trim())
        resolve({ timedOut: false, ...parsed })
      } catch {
        resolve({
          results: [],
          error: stderr.slice(0, 500) || 'Execution failed (parse error)',
          timedOut: false,
        })
      }
    })

    child.stdin.write(payload, () => {
      child.stdin.end()
    })

    child.on('error', err => {
      clearTimeout(timer)
      resolve({ results: [], error: `Process error: ${err.message}`, timedOut: false })
    })
  })
}
