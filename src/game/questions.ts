export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuestionType = 'QUIZ' | 'CODE' | 'DEBUG' | 'OUTPUT'

export interface Choice {
  label: 'A' | 'B' | 'C' | 'D'
  text: string
}

export interface Question {
  id: string
  type: QuestionType
  topic: string
  difficulty: Difficulty
  prompt: string
  // QUIZ
  choices?: Choice[]
  correctChoice?: 'A' | 'B' | 'C' | 'D'
  // CODE / DEBUG
  starterCode?: string
  checkAnswer?: (code: string) => boolean
  // OUTPUT PREDICTION
  codeToRead?: string
  expectedOutput?: string
  hint1: string
  hint2: string
  explanation: string
}

export interface MysteryEvent {
  icon: string
  title: string
  description: string
  xp: number
  powerUp: 'hint' | 'shield' | 'doubleDice' | null
  spaces: number
}

export const MYSTERY_EVENTS: MysteryEvent[] = [
  { icon: '⭐', title: 'BONUS BLOCK!',    description: 'You smashed a hidden ? Block — coins rain down!',       xp: 25,  powerUp: null,         spaces:  0 },
  { icon: '🌟', title: 'SUPER STAR!',     description: 'A golden star floats down from the clouds!',             xp: 50,  powerUp: null,         spaces:  0 },
  { icon: '🍄', title: 'SUPER MUSHROOM!', description: 'A power-up mushroom bounces your way!',                  xp: 10,  powerUp: 'hint',        spaces:  0 },
  { icon: '🎲', title: 'LUCKY DICE!',     description: 'Double Dice power-up acquired for your next roll!',      xp: 0,   powerUp: 'doubleDice',  spaces:  0 },
  { icon: '🪙', title: 'COIN HEAVEN!',    description: 'Coins pour from the sky like rain!',                     xp: 35,  powerUp: null,         spaces:  0 },
  { icon: '🌀', title: 'WARP PIPE!',      description: 'Whoooosh! Jump forward 2 spaces!',                       xp: 0,   powerUp: null,         spaces:  2 },
  { icon: '🛡️', title: 'SHIELD BLOCK!',   description: 'You found a protective shield block!',                   xp: 0,   powerUp: 'shield',      spaces:  0 },
  { icon: '💨', title: 'BOWSER JR!',      description: 'He huffs and puffs you back 2 spaces! Oof.',             xp: -10, powerUp: null,         spaces: -2 },
  { icon: '💸', title: 'KOOPA TAX!',      description: 'The Koopa Tax Collector demands 15 XP! Not fair.',       xp: -15, powerUp: null,         spaces:  0 },
  { icon: '🔥', title: 'FIRE FLOWER!',    description: 'Spicy! A bonus hint power-up appears!',                  xp: 15,  powerUp: 'hint',        spaces:  0 },
]

export const QUESTIONS: Question[] = [
  // ─── QUIZ ─────────────────────────────────────────────────────────────────
  {
    id: 'q-001', type: 'QUIZ', topic: 'operators', difficulty: 'easy',
    prompt: 'What is the output of print(10 // 3)?',
    choices: [
      { label: 'A', text: '3.33' }, { label: 'B', text: '3' },
      { label: 'C', text: '4' },    { label: 'D', text: '1' },
    ],
    correctChoice: 'B',
    hint1: 'The `//` operator is called integer (floor) division.',
    hint2: 'Floor division rounds the result DOWN to the nearest whole number.',
    explanation: '`10 // 3` = 3.33… rounded down to 3. Floor division discards the decimal part.',
  },
  {
    id: 'q-002', type: 'QUIZ', topic: 'functions', difficulty: 'easy',
    prompt: 'Which keyword is used to define a function in Python?',
    choices: [
      { label: 'A', text: 'function' }, { label: 'B', text: 'fun' },
      { label: 'C', text: 'def' },      { label: 'D', text: 'define' },
    ],
    correctChoice: 'C',
    hint1: 'The keyword is exactly 3 letters long.',
    hint2: "It's short for \"definition\".",
    explanation: '`def` is Python\'s keyword for defining functions. Example: `def my_func():`',
  },
  {
    id: 'q-003', type: 'QUIZ', topic: 'strings', difficulty: 'easy',
    prompt: 'What does len("hello") return?',
    choices: [
      { label: 'A', text: '4' }, { label: 'B', text: '5' },
      { label: 'C', text: '6' }, { label: 'D', text: '"hello"' },
    ],
    correctChoice: 'B',
    hint1: 'Count every character in the word.',
    hint2: 'h-e-l-l-o: count them one by one.',
    explanation: '"hello" has 5 characters: h, e, l, l, o. So `len("hello")` returns 5.',
  },
  {
    id: 'q-004', type: 'QUIZ', topic: 'booleans', difficulty: 'easy',
    prompt: 'What is the value of bool(0)?',
    choices: [
      { label: 'A', text: 'True' }, { label: 'B', text: 'False' },
      { label: 'C', text: '0' },    { label: 'D', text: 'None' },
    ],
    correctChoice: 'B',
    hint1: 'In Python, some values are "falsy" — they behave like False.',
    hint2: 'Zero, empty strings, and empty lists are all falsy.',
    explanation: '`bool(0)` returns `False`. The number 0 is a "falsy" value in Python.',
  },
  {
    id: 'q-005', type: 'QUIZ', topic: 'operators', difficulty: 'medium',
    prompt: 'What is the result of 2 ** 8?',
    choices: [
      { label: 'A', text: '16' },  { label: 'B', text: '64' },
      { label: 'C', text: '128' }, { label: 'D', text: '256' },
    ],
    correctChoice: 'D',
    hint1: 'The `**` operator raises a number to a power (exponentiation).',
    hint2: '2^8 means 2 multiplied by itself 8 times.',
    explanation: '2^8 = 2×2×2×2×2×2×2×2 = 256. `**` is Python\'s power operator.',
  },
  {
    id: 'q-006', type: 'QUIZ', topic: 'strings', difficulty: 'easy',
    prompt: 'What does "Ha" * 3 evaluate to?',
    choices: [
      { label: 'A', text: 'Ha3' },     { label: 'B', text: 'Ha Ha Ha' },
      { label: 'C', text: 'HaHaHa' },  { label: 'D', text: '6' },
    ],
    correctChoice: 'C',
    hint1: 'Multiplying a string by an integer repeats it.',
    hint2: 'No spaces are inserted between the repetitions.',
    explanation: '"Ha" * 3 repeats "Ha" three times without spaces: "HaHaHa".',
  },
  {
    id: 'q-007', type: 'QUIZ', topic: 'loops', difficulty: 'easy',
    prompt: 'What numbers does range(5) generate?',
    choices: [
      { label: 'A', text: '1, 2, 3, 4, 5' },   { label: 'B', text: '0, 1, 2, 3, 4' },
      { label: 'C', text: '0, 1, 2, 3, 4, 5' }, { label: 'D', text: '1, 2, 3, 4' },
    ],
    correctChoice: 'B',
    hint1: 'Python starts counting from 0 by default.',
    hint2: 'range(n) goes FROM 0 UP TO but NOT INCLUDING n.',
    explanation: '`range(5)` generates 0, 1, 2, 3, 4. It stops BEFORE reaching 5.',
  },
  {
    id: 'q-008', type: 'QUIZ', topic: 'comparisons', difficulty: 'easy',
    prompt: 'Which operator checks if two values are EQUAL in Python?',
    choices: [
      { label: 'A', text: '=' },   { label: 'B', text: '==' },
      { label: 'C', text: '===' }, { label: 'D', text: ':=' },
    ],
    correctChoice: 'B',
    hint1: 'A single `=` assigns a value; it does not compare.',
    hint2: 'Equality comparison in Python uses a double equals sign.',
    explanation: '`==` checks equality. A single `=` assigns a value to a variable.',
  },
  {
    id: 'q-009', type: 'QUIZ', topic: 'lists', difficulty: 'medium',
    prompt: 'Which method adds an item to the END of a list?',
    choices: [
      { label: 'A', text: 'add()' },    { label: 'B', text: 'push()' },
      { label: 'C', text: 'insert()' }, { label: 'D', text: 'append()' },
    ],
    correctChoice: 'D',
    hint1: "Think of \"appending\" a page to a document.",
    hint2: '`insert()` adds at a specific position — what adds to the end?',
    explanation: '`list.append(item)` adds to the end. `insert(i, item)` adds at index i.',
  },
  {
    id: 'q-010', type: 'QUIZ', topic: 'conditionals', difficulty: 'medium',
    prompt: "What keyword follows `if` when you need another condition?",
    choices: [
      { label: 'A', text: 'else if' }, { label: 'B', text: 'elsif' },
      { label: 'C', text: 'elif' },    { label: 'D', text: 'or if' },
    ],
    correctChoice: 'C',
    hint1: "Python shortens \"else if\" into a single keyword.",
    hint2: 'Combine "el" from "else" and "if" together.',
    explanation: '`elif` is Python\'s contracted "else if". Example: `elif x > 5:`',
  },
  {
    id: 'q-011', type: 'QUIZ', topic: 'variables', difficulty: 'easy',
    prompt: 'What does this print?  x = 5; x += 3; print(x)',
    choices: [
      { label: 'A', text: '5' }, { label: 'B', text: '3' },
      { label: 'C', text: '8' }, { label: 'D', text: '53' },
    ],
    correctChoice: 'C',
    hint1: '`+=` is shorthand for x = x + 3.',
    hint2: 'Start with 5, then add 3.',
    explanation: 'x starts as 5. `x += 3` makes x = 5 + 3 = 8. `print(x)` prints 8.',
  },
  {
    id: 'q-012', type: 'QUIZ', topic: 'strings', difficulty: 'medium',
    prompt: 'What does "python".upper() return?',
    choices: [
      { label: 'A', text: 'Python' }, { label: 'B', text: 'PYTHON' },
      { label: 'C', text: 'python' }, { label: 'D', text: 'pYTHON' },
    ],
    correctChoice: 'B',
    hint1: 'The `.upper()` method transforms ALL letters in the string.',
    hint2: 'It converts every lowercase letter to uppercase.',
    explanation: '`"python".upper()` converts every letter to uppercase: "PYTHON".',
  },

  // ─── OUTPUT PREDICTION ─────────────────────────────────────────────────────
  {
    id: 'o-001', type: 'OUTPUT', topic: 'variables', difficulty: 'easy',
    prompt: 'What does this code print? Type the exact output.',
    codeToRead: 'x = 5\ny = 3\nprint(x + y)',
    expectedOutput: '8',
    hint1: 'What is 5 + 3?',
    hint2: 'The print statement outputs the result of x + y.',
    explanation: 'x = 5, y = 3. x + y = 8. `print(8)` outputs 8.',
  },
  {
    id: 'o-002', type: 'OUTPUT', topic: 'loops', difficulty: 'easy',
    prompt: 'What does this code print? (Use a new line for each number)',
    codeToRead: 'for i in range(3):\n    print(i)',
    expectedOutput: '0\n1\n2',
    hint1: 'range(3) generates exactly three numbers starting at 0.',
    hint2: 'Each loop iteration prints one number on its own line.',
    explanation: 'range(3) = [0, 1, 2]. The loop prints 0, then 1, then 2, each on a new line.',
  },
  {
    id: 'o-003', type: 'OUTPUT', topic: 'strings', difficulty: 'easy',
    prompt: 'What does this code print?',
    codeToRead: 'name = "Mario"\nprint(f"Hello, {name}!")',
    expectedOutput: 'Hello, Mario!',
    hint1: 'f-strings substitute the variable value inside {}.',
    hint2: '{name} gets replaced by the value of the name variable.',
    explanation: 'The f-string replaces {name} with "Mario", printing: Hello, Mario!',
  },
  {
    id: 'o-004', type: 'OUTPUT', topic: 'variables', difficulty: 'easy',
    prompt: 'What does this code print?',
    codeToRead: 'x = 10\nx = x + 5\nprint(x)',
    expectedOutput: '15',
    hint1: 'x starts at 10, then gets reassigned a new value.',
    hint2: 'The new value of x is 10 + 5.',
    explanation: 'x starts as 10. x = 10 + 5 = 15. `print(x)` outputs 15.',
  },
  {
    id: 'o-005', type: 'OUTPUT', topic: 'lists', difficulty: 'medium',
    prompt: 'What does this code print?',
    codeToRead: 'nums = [10, 20, 30]\nprint(nums[1])',
    expectedOutput: '20',
    hint1: 'List indexing starts at 0, not 1.',
    hint2: 'Index 0 = 10, index 1 = 20, index 2 = 30.',
    explanation: 'nums[1] accesses the SECOND element (index 1), which is 20.',
  },
  {
    id: 'o-006', type: 'OUTPUT', topic: 'conditionals', difficulty: 'medium',
    prompt: 'What does this code print?',
    codeToRead: 'x = 7\nif x > 5:\n    print("big")\nelse:\n    print("small")',
    expectedOutput: 'big',
    hint1: 'Is 7 greater than 5?',
    hint2: 'Since 7 > 5 is True, which block runs?',
    explanation: '7 > 5 is True, so the if-block runs and prints "big". The else is skipped.',
  },
  {
    id: 'o-007', type: 'OUTPUT', topic: 'functions', difficulty: 'hard',
    prompt: 'What does this code print?',
    codeToRead: 'def double(x):\n    return x * 2\n\nresult = double(double(3))\nprint(result)',
    expectedOutput: '12',
    hint1: 'Evaluate from the inside out: compute double(3) first.',
    hint2: 'double(3) = 6. Then double(6) = ?',
    explanation: 'double(3) = 6. double(6) = 12. result = 12. print(12) outputs 12.',
  },

  // ─── CODE ──────────────────────────────────────────────────────────────────
  {
    id: 'c-001', type: 'CODE', topic: 'functions', difficulty: 'easy',
    prompt: 'Write a function add(a, b) that returns the sum of a and b.',
    starterCode: 'def add(a, b):\n    # your code here\n    pass',
    checkAnswer: (code) =>
      /return\s+a\s*\+\s*b/.test(code) || /return\s+b\s*\+\s*a/.test(code),
    hint1: 'Use the `+` operator to add a and b together.',
    hint2: 'Your return statement should compute: a + b',
    explanation: 'def add(a, b):\n    return a + b',
  },
  {
    id: 'c-002', type: 'CODE', topic: 'strings', difficulty: 'easy',
    prompt: 'Write a function greet(name) that returns "Hello, {name}!"',
    starterCode: 'def greet(name):\n    # your code here\n    pass',
    checkAnswer: (code) =>
      /return\s+f["']Hello,\s*\{name\}!["']/.test(code) ||
      /return\s+"Hello,\s*"\s*\+\s*name\s*\+\s*"!"/.test(code) ||
      /return\s+'Hello,\s*'\s*\+\s*name\s*\+\s*'!'/.test(code),
    hint1: 'You can use an f-string: return f"Hello, {name}!"',
    hint2: 'Or concatenate strings: return "Hello, " + name + "!"',
    explanation: 'def greet(name):\n    return f"Hello, {name}!"',
  },
  {
    id: 'c-003', type: 'CODE', topic: 'conditionals', difficulty: 'medium',
    prompt: 'Write a function is_even(n) that returns True if n is even, False otherwise.',
    starterCode: 'def is_even(n):\n    # your code here\n    pass',
    checkAnswer: (code) =>
      /n\s*%\s*2\s*==\s*0/.test(code) || /not\s+n\s*%\s*2/.test(code),
    hint1: 'Use the modulo operator `%` to find the remainder.',
    hint2: 'An even number has remainder 0 when divided by 2.',
    explanation: 'def is_even(n):\n    return n % 2 == 0',
  },
  {
    id: 'c-004', type: 'CODE', topic: 'loops', difficulty: 'medium',
    prompt: 'Write a function sum_to(n) that returns the sum of all integers from 1 to n (inclusive).',
    starterCode: 'def sum_to(n):\n    # your code here\n    pass',
    checkAnswer: (code) =>
      (/for|while/.test(code) && /return/.test(code)) ||
      /return\s+n\s*\*\s*\(n\s*\+\s*1\)\s*\/\/\s*2/.test(code) ||
      /return\s+sum\(range/.test(code),
    hint1: 'Start with total = 0 and add each number from 1 to n.',
    hint2: 'Try: for i in range(1, n + 1): total += i',
    explanation: 'def sum_to(n):\n    total = 0\n    for i in range(1, n + 1):\n        total += i\n    return total',
  },
  {
    id: 'c-005', type: 'CODE', topic: 'functions', difficulty: 'easy',
    prompt: 'Write a function square(n) that returns n multiplied by itself.',
    starterCode: 'def square(n):\n    # your code here\n    pass',
    checkAnswer: (code) =>
      /return\s+n\s*\*\s*n/.test(code) || /return\s+n\s*\*\*\s*2/.test(code),
    hint1: 'Squaring means multiplying a number by itself.',
    hint2: 'You can use `n * n` or the power operator `n ** 2`.',
    explanation: 'def square(n):\n    return n * n',
  },
  {
    id: 'c-006', type: 'CODE', topic: 'strings', difficulty: 'medium',
    prompt: 'Write a function repeat(s, n) that returns the string s repeated n times.',
    starterCode: 'def repeat(s, n):\n    # your code here\n    pass',
    checkAnswer: (code) =>
      /return\s+s\s*\*\s*n/.test(code) || /return\s+n\s*\*\s*s/.test(code),
    hint1: 'Python can multiply a string by an integer.',
    hint2: 'Try: return s * n',
    explanation: 'def repeat(s, n):\n    return s * n',
  },

  // ─── DEBUG ─────────────────────────────────────────────────────────────────
  {
    id: 'd-001', type: 'DEBUG', topic: 'syntax', difficulty: 'easy',
    prompt: 'Fix the syntax error in this function:',
    starterCode: 'def say_hi(name)\n    return "Hi, " + name',
    checkAnswer: (code) =>
      /def say_hi\(name\)\s*:/.test(code) && /return/.test(code),
    hint1: 'Look carefully at the function definition line.',
    hint2: 'All function definitions must end with a colon `:`.',
    explanation: 'Missing `:` after `def say_hi(name)`. Fix: `def say_hi(name):`',
  },
  {
    id: 'd-002', type: 'DEBUG', topic: 'syntax', difficulty: 'easy',
    prompt: 'Fix the indentation bug in this function:',
    starterCode: 'def double(n):\nreturn n * 2',
    checkAnswer: (code) =>
      /def double\(n\):/.test(code) && /[ \t]+return\s+n\s*\*\s*2/.test(code),
    hint1: "Python uses indentation to define what's inside a function.",
    hint2: 'The `return` line must be indented (4 spaces) inside the function.',
    explanation: '`return n * 2` must be indented 4 spaces to be inside the function body.',
  },
  {
    id: 'd-003', type: 'DEBUG', topic: 'logic', difficulty: 'medium',
    prompt: 'Fix the logic error — this should return True for EVEN numbers:',
    starterCode: 'def is_even(n):\n    return n % 2 == 1',
    checkAnswer: (code) =>
      /n\s*%\s*2\s*==\s*0/.test(code) || (/not/.test(code) && /n\s*%\s*2/.test(code)),
    hint1: 'Think: what remainder does an EVEN number have when divided by 2?',
    hint2: 'An even number divided by 2 has remainder 0, not 1.',
    explanation: 'Bug: `n % 2 == 1` checks for ODD. Fix: `return n % 2 == 0`.',
  },
  {
    id: 'd-004', type: 'DEBUG', topic: 'variables', difficulty: 'medium',
    prompt: "Fix the typo causing a NameError:",
    starterCode: 'def greet(name):\n    mesage = "Hello, " + name\n    return message',
    checkAnswer: (code) =>
      !code.includes('mesage') && /message\s*=/.test(code) && /return\s+message/.test(code),
    hint1: 'Python is case-sensitive. Variable names must match exactly.',
    hint2: 'Compare `mesage` and `message` — spot the difference!',
    explanation: '`mesage` is a typo. Fix: change `mesage = ...` to `message = ...`.',
  },
  {
    id: 'd-005', type: 'DEBUG', topic: 'syntax', difficulty: 'hard',
    prompt: 'Find and fix BOTH bugs in this function:',
    starterCode: 'def count_up(n)\n    for i in rage(n):\n        print(i)',
    checkAnswer: (code) =>
      /def count_up\(n\)\s*:/.test(code) && /range\(n\)/.test(code) && !/rage\(/.test(code),
    hint1: 'There are two bugs: check the function definition AND the loop.',
    hint2: 'Bug 1: missing colon after `def count_up(n)`. Bug 2: `rage` → `range`.',
    explanation: 'Fix 1: `def count_up(n):` (add colon). Fix 2: `range(n)` (not `rage`).',
  },
]
