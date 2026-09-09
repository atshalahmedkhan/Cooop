import { execPython, type TestCase, type ExecutionResult } from './sandbox.js'

const MAX_CONCURRENT = 4  // max simultaneous Python processes

interface Task {
  code: string
  tests: TestCase[]
  mode: 'run' | 'submit'
  resolve: (r: ExecutionResult) => void
}

const pending: Task[] = []
let running = 0

function drain() {
  while (running < MAX_CONCURRENT && pending.length > 0) {
    const task = pending.shift()!
    running++
    execPython(task.code, task.tests, task.mode).then(result => {
      task.resolve(result)
    }).catch(err => {
      task.resolve({ results: [], error: String(err), timedOut: false })
    }).finally(() => {
      running--
      drain()
    })
  }
}

export function enqueueExecution(
  code: string,
  tests: TestCase[],
  mode: 'run' | 'submit',
): Promise<ExecutionResult> {
  return new Promise(resolve => {
    pending.push({ code, tests, mode, resolve })
    drain()
  })
}

export type { TestCase, ExecutionResult, TestResult } from './sandbox.js'
