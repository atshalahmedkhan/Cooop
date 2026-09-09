import { db, initDb } from './client.js'
import { boards, board_nodes, board_edges, questions, question_versions } from './schema.js'
import { randomUUID } from 'node:crypto'

// ── Board definition — must match App.tsx SPACES exactly ─────────────────────

const BOARD_NODES: Array<{ key: number; type: string; label: string; topic?: string }> = [
  { key: 0,  type: 'CORNER',  label: 'Start', topic: 'tl' },
  { key: 1,  type: 'CODE',    label: 'Code' },
  { key: 2,  type: 'QUIZ',    label: 'Quiz' },
  { key: 3,  type: 'DEBUG',   label: 'Debug' },
  { key: 4,  type: 'LOGIC',   label: 'Logic', topic: 'fork' },   // fork node
  { key: 5,  type: 'MYSTERY', label: 'Mystery' },
  { key: 6,  type: 'CODE',    label: 'Code' },
  { key: 7,  type: 'BATTLE',  label: 'Battle' },
  { key: 8,  type: 'QUIZ',    label: 'Quiz' },                    // fork rejoins
  { key: 9,  type: 'CORNER',  label: 'Corner', topic: 'tr' },
  { key: 10, type: 'CODE',    label: 'Code' },
  { key: 11, type: 'DEBUG',   label: 'Debug' },
  { key: 12, type: 'LOGIC',   label: 'Logic' },
  { key: 13, type: 'MYSTERY', label: 'Mystery' },
  { key: 14, type: 'QUIZ',    label: 'Quiz' },
  { key: 15, type: 'CODE',    label: 'Code' },
  { key: 16, type: 'CORNER',  label: 'Corner', topic: 'br' },
  { key: 17, type: 'BOSS',    label: 'Bowser' },
  { key: 18, type: 'BATTLE',  label: 'Battle' },
  { key: 19, type: 'CODE',    label: 'Code' },
  { key: 20, type: 'QUIZ',    label: 'Quiz' },
  { key: 21, type: 'DEBUG',   label: 'Debug' },
  { key: 22, type: 'LOGIC',   label: 'Logic' },
  { key: 23, type: 'MYSTERY', label: 'Mystery' },
  { key: 24, type: 'CODE',    label: 'Code' },
  { key: 25, type: 'CORNER',  label: 'Corner', topic: 'bl' },
  { key: 26, type: 'QUIZ',    label: 'Quiz' },
  { key: 27, type: 'CODE',    label: 'Code' },
  { key: 28, type: 'LOGIC',   label: 'Logic' },
  { key: 29, type: 'DEBUG',   label: 'Debug' },
  { key: 30, type: 'MYSTERY', label: 'Mystery' },
  { key: 31, type: 'BATTLE',  label: 'Battle' },
]

// ── Question type helpers ──────────────────────────────────────────────────────

interface CodeTestCase {
  input: string
  expected_output: string
  hint?: string
}

interface CodeAnswerData {
  type: 'CODE' | 'DEBUG'
  public_tests: CodeTestCase[]
  hidden_tests: CodeTestCase[]
}

interface QuizAnswerData {
  type: 'QUIZ'
  choices: { A: string; B: string; C: string; D: string }
  correct_choice: 'A' | 'B' | 'C' | 'D'
}

interface OutputAnswerData {
  type: 'OUTPUT'
  expected_output: string
}

interface LogicAnswerData {
  type: 'LOGIC'
  choices: { A: string; B: string; C: string; D: string }
  correct_choice: 'A' | 'B' | 'C' | 'D'
}

type AnswerData = CodeAnswerData | QuizAnswerData | OutputAnswerData | LogicAnswerData

interface SeedQuestion {
  type: 'QUIZ' | 'LOGIC' | 'OUTPUT' | 'CODE' | 'DEBUG'
  topic: string
  subtopic: string
  difficulty: 'easy' | 'medium' | 'hard'
  prompt: string
  instructions?: string
  answer_data: AnswerData
  explanation: string
}

// ── CODE questions ─────────────────────────────────────────────────────────────

const CODE_QUESTIONS: SeedQuestion[] = [
  // easy
  {
    type: 'CODE', topic: 'functions', subtopic: 'addition', difficulty: 'easy',
    prompt: 'Write a function `add(a, b)` that returns the sum of two numbers.',
    instructions: 'def add(a, b):\n    # Your code here\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(add(1, 2))', expected_output: '3', hint: 'Use the + operator and return the result' },
        { input: 'print(add(-1, 5))', expected_output: '4' },
      ],
      hidden_tests: [
        { input: 'print(add(100, 200))', expected_output: '300' },
        { input: 'print(add(0, 0))', expected_output: '0' },
      ],
    },
    explanation: '`def add(a, b): return a + b` — the return keyword sends back the computed value.',
  },
  {
    type: 'CODE', topic: 'conditionals', subtopic: 'even-check', difficulty: 'easy',
    prompt: 'Write a function `is_even(n)` that returns `True` if `n` is even, `False` otherwise.',
    instructions: 'def is_even(n):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(is_even(4))', expected_output: 'True', hint: 'Use the modulo operator %' },
        { input: 'print(is_even(7))', expected_output: 'False' },
      ],
      hidden_tests: [
        { input: 'print(is_even(0))', expected_output: 'True' },
        { input: 'print(is_even(-2))', expected_output: 'True' },
      ],
    },
    explanation: '`return n % 2 == 0` — modulo 2 is 0 for even numbers, 1 for odd.',
  },
  {
    type: 'CODE', topic: 'strings', subtopic: 'repeat', difficulty: 'easy',
    prompt: 'Write a function `repeat_str(s, n)` that returns the string `s` repeated `n` times.',
    instructions: 'def repeat_str(s, n):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(repeat_str("ha", 3))', expected_output: 'hahaha', hint: 'Python strings support the * operator' },
        { input: 'print(repeat_str("abc", 2))', expected_output: 'abcabc' },
      ],
      hidden_tests: [
        { input: 'print(repeat_str("x", 1))', expected_output: 'x' },
        { input: 'print(repeat_str("ab", 0))', expected_output: '' },
      ],
    },
    explanation: '`return s * n` — string multiplication repeats the string n times.',
  },
  // medium
  {
    type: 'CODE', topic: 'loops', subtopic: 'max-value', difficulty: 'medium',
    prompt: 'Write a function `find_max(lst)` that returns the largest number in a non-empty list **without** using the built-in `max()` function.',
    instructions: 'def find_max(lst):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(find_max([3, 1, 4, 1, 5, 9]))', expected_output: '9', hint: 'Track the largest value seen so far as you loop' },
        { input: 'print(find_max([10]))', expected_output: '10' },
      ],
      hidden_tests: [
        { input: 'print(find_max([-1, -5, -3]))', expected_output: '-1' },
        { input: 'print(find_max([7, 7, 7]))', expected_output: '7' },
      ],
    },
    explanation: 'Initialize `best = lst[0]`, loop through `lst`, update `best = x` whenever `x > best`.',
  },
  {
    type: 'CODE', topic: 'strings', subtopic: 'vowel-count', difficulty: 'medium',
    prompt: 'Write a function `count_vowels(s)` that returns the number of vowels (a, e, i, o, u — case-insensitive) in the string.',
    instructions: 'def count_vowels(s):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(count_vowels("Hello World"))', expected_output: '3', hint: 'Convert to lowercase and count characters in "aeiou"' },
        { input: 'print(count_vowels("Python"))', expected_output: '1' },
      ],
      hidden_tests: [
        { input: 'print(count_vowels(""))', expected_output: '0' },
        { input: 'print(count_vowels("AEIOU"))', expected_output: '5' },
      ],
    },
    explanation: '`return sum(1 for c in s.lower() if c in "aeiou")`',
  },
  {
    type: 'CODE', topic: 'recursion', subtopic: 'factorial', difficulty: 'medium',
    prompt: 'Write a function `factorial(n)` that returns `n!` (n factorial). Assume n >= 0.',
    instructions: 'def factorial(n):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(factorial(5))', expected_output: '120', hint: 'factorial(n) = n * factorial(n-1), base case: factorial(0) = 1' },
        { input: 'print(factorial(0))', expected_output: '1' },
      ],
      hidden_tests: [
        { input: 'print(factorial(1))', expected_output: '1' },
        { input: 'print(factorial(7))', expected_output: '5040' },
      ],
    },
    explanation: '`if n == 0: return 1; return n * factorial(n - 1)` — classic recursion.',
  },
  // hard
  {
    type: 'CODE', topic: 'strings', subtopic: 'palindrome', difficulty: 'hard',
    prompt: 'Write a function `is_palindrome(s)` that returns `True` if `s` reads the same forwards and backwards (case-insensitive, ignoring spaces), `False` otherwise.',
    instructions: 'def is_palindrome(s):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(is_palindrome("racecar"))', expected_output: 'True', hint: 'Strip spaces, lowercase, then compare with its reverse' },
        { input: 'print(is_palindrome("hello"))', expected_output: 'False' },
        { input: 'print(is_palindrome("A man a plan a canal Panama"))', expected_output: 'True' },
      ],
      hidden_tests: [
        { input: 'print(is_palindrome(""))', expected_output: 'True' },
        { input: 'print(is_palindrome("Madam"))', expected_output: 'True' },
      ],
    },
    explanation: '`s = s.replace(" ", "").lower(); return s == s[::-1]`',
  },
  {
    type: 'CODE', topic: 'lists', subtopic: 'two-sum', difficulty: 'hard',
    prompt: 'Write a function `two_sum(nums, target)` that returns a list of two indices whose values add up to `target`. Assume exactly one solution exists.',
    instructions: 'def two_sum(nums, target):\n    pass',
    answer_data: {
      type: 'CODE',
      public_tests: [
        { input: 'print(two_sum([2, 7, 11, 15], 9))', expected_output: '[0, 1]', hint: 'Try each pair of indices using two nested loops' },
        { input: 'print(two_sum([3, 2, 4], 6))', expected_output: '[1, 2]' },
      ],
      hidden_tests: [
        { input: 'print(two_sum([3, 3], 6))', expected_output: '[0, 1]' },
        { input: 'print(two_sum([1, 5, 3, 2], 4))', expected_output: '[0, 3]' },
      ],
    },
    explanation: 'Use a dictionary to store seen values and their indices for O(n) lookup.',
  },
]

// ── DEBUG questions ────────────────────────────────────────────────────────────

const DEBUG_QUESTIONS: SeedQuestion[] = [
  // easy
  {
    type: 'DEBUG', topic: 'loops', subtopic: 'off-by-one', difficulty: 'easy',
    prompt: 'The function `count_to(n)` should return `[1, 2, ..., n]` but it has a bug. Fix it.',
    instructions: 'def count_to(n):\n    result = []\n    for i in range(n):  # bug is here\n        result.append(i)\n    return result',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(count_to(3))', expected_output: '[1, 2, 3]', hint: 'range(n) starts at 0 — adjust the start and stop' },
        { input: 'print(count_to(5))', expected_output: '[1, 2, 3, 4, 5]' },
      ],
      hidden_tests: [
        { input: 'print(count_to(1))', expected_output: '[1]' },
        { input: 'print(count_to(0))', expected_output: '[]' },
      ],
    },
    explanation: 'Change `range(n)` to `range(1, n + 1)` so it starts at 1 and includes n.',
  },
  {
    type: 'DEBUG', topic: 'operators', subtopic: 'wrong-operator', difficulty: 'easy',
    prompt: 'The function `multiply(a, b)` should return the product but returns the wrong result. Fix it.',
    instructions: 'def multiply(a, b):\n    return a + b  # bug is here',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(multiply(3, 4))', expected_output: '12', hint: 'The bug is in the operator used' },
        { input: 'print(multiply(5, 0))', expected_output: '0' },
      ],
      hidden_tests: [
        { input: 'print(multiply(7, 8))', expected_output: '56' },
        { input: 'print(multiply(-2, 3))', expected_output: '-6' },
      ],
    },
    explanation: 'Change `a + b` to `a * b` — the function was adding instead of multiplying.',
  },
  {
    type: 'DEBUG', topic: 'conditionals', subtopic: 'wrong-comparison', difficulty: 'easy',
    prompt: 'The function `is_negative(n)` should return `True` only for strictly negative numbers. Fix the bug.',
    instructions: 'def is_negative(n):\n    if n <= 0:  # bug is here\n        return True\n    return False',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(is_negative(-5))', expected_output: 'True', hint: 'Zero should NOT be considered negative' },
        { input: 'print(is_negative(0))', expected_output: 'False' },
      ],
      hidden_tests: [
        { input: 'print(is_negative(3))', expected_output: 'False' },
        { input: 'print(is_negative(-1))', expected_output: 'True' },
      ],
    },
    explanation: 'Change `n <= 0` to `n < 0`. Zero is not negative.',
  },
  // medium
  {
    type: 'DEBUG', topic: 'functions', subtopic: 'wrong-return', difficulty: 'medium',
    prompt: 'The function `max_of_two(a, b)` should return the larger number, but returns the smaller. Fix it.',
    instructions: 'def max_of_two(a, b):\n    if a > b:\n        return b  # bug\n    return a  # bug',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(max_of_two(5, 3))', expected_output: '5', hint: 'When a > b, which should you return?' },
        { input: 'print(max_of_two(1, 9))', expected_output: '9' },
      ],
      hidden_tests: [
        { input: 'print(max_of_two(4, 4))', expected_output: '4' },
        { input: 'print(max_of_two(-1, -5))', expected_output: '-1' },
      ],
    },
    explanation: 'When `a > b`, return `a` (not `b`), and in the else branch return `b` (not `a`).',
  },
  {
    type: 'DEBUG', topic: 'loops', subtopic: 'logic-error', difficulty: 'medium',
    prompt: 'The function `sum_even(lst)` should sum only the even numbers in the list. Find and fix the bug.',
    instructions: 'def sum_even(lst):\n    total = 0\n    for n in lst:\n        if n % 2 == 1:  # bug\n            total += n\n    return total',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(sum_even([1, 2, 3, 4, 5, 6]))', expected_output: '12', hint: 'Even numbers have remainder 0, not 1, when divided by 2' },
        { input: 'print(sum_even([2, 4, 6]))', expected_output: '12' },
      ],
      hidden_tests: [
        { input: 'print(sum_even([1, 3, 5]))', expected_output: '0' },
        { input: 'print(sum_even([]))', expected_output: '0' },
      ],
    },
    explanation: 'Change `n % 2 == 1` to `n % 2 == 0` to select even numbers.',
  },
  {
    type: 'DEBUG', topic: 'strings', subtopic: 'index-error', difficulty: 'medium',
    prompt: 'The function `first_char(s)` should return the first character of a string, or an empty string if the string is empty. Fix the bug.',
    instructions: 'def first_char(s):\n    return s[0]  # bug: crashes on empty string',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(first_char("hello"))', expected_output: 'h', hint: 'Add a check for an empty string before indexing' },
        { input: 'print(first_char(""))', expected_output: '' },
      ],
      hidden_tests: [
        { input: 'print(first_char("Python"))', expected_output: 'P' },
        { input: 'print(first_char(" "))', expected_output: ' ' },
      ],
    },
    explanation: '`if not s: return ""; return s[0]` — guard against empty string before indexing.',
  },
  // hard
  {
    type: 'DEBUG', topic: 'recursion', subtopic: 'base-case', difficulty: 'hard',
    prompt: 'The recursive function `power(base, exp)` should return `base ** exp` for non-negative integers. It has a bug. Fix it.',
    instructions: 'def power(base, exp):\n    if exp == 1:  # bug: wrong base case\n        return base\n    return base * power(base, exp - 1)',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(power(2, 3))', expected_output: '8', hint: 'What should power(2, 0) return? Check the base case.' },
        { input: 'print(power(5, 0))', expected_output: '1' },
      ],
      hidden_tests: [
        { input: 'print(power(3, 4))', expected_output: '81' },
        { input: 'print(power(1, 100))', expected_output: '1' },
      ],
    },
    explanation: 'Change `exp == 1` to `exp == 0` and `return base` to `return 1`. Any number to the power 0 is 1.',
  },
  {
    type: 'DEBUG', topic: 'functions', subtopic: 'scope', difficulty: 'hard',
    prompt: 'The function `running_total(numbers)` should return a list of cumulative sums, but it has a bug. Fix it.',
    instructions: 'def running_total(numbers):\n    result = []\n    total = 0\n    for n in numbers:\n        n += total  # bug: should update total\n        result.append(n)\n    return result',
    answer_data: {
      type: 'DEBUG',
      public_tests: [
        { input: 'print(running_total([1, 2, 3, 4]))', expected_output: '[1, 3, 6, 10]', hint: 'The variable being updated inside the loop is wrong' },
        { input: 'print(running_total([5]))', expected_output: '[5]' },
      ],
      hidden_tests: [
        { input: 'print(running_total([]))', expected_output: '[]' },
        { input: 'print(running_total([10, -5, 3]))', expected_output: '[10, 5, 8]' },
      ],
    },
    explanation: 'Change `n += total` to `total += n` to accumulate into the total variable.',
  },
]

// ── QUIZ questions ─────────────────────────────────────────────────────────────

const QUIZ_QUESTIONS: SeedQuestion[] = [
  { type: 'QUIZ', topic: 'variables', subtopic: 'assignment', difficulty: 'easy',
    prompt: 'Which of the following is a valid way to assign the value 10 to a variable called `x` in Python?',
    answer_data: { type: 'QUIZ', choices: { A: 'x == 10', B: 'x = 10', C: '10 = x', D: 'x := 10' }, correct_choice: 'B' },
    explanation: 'In Python, `=` is the assignment operator. `==` is comparison.' },
  { type: 'QUIZ', topic: 'booleans', subtopic: 'values', difficulty: 'easy',
    prompt: 'What are the two possible values of a Python boolean?',
    answer_data: { type: 'QUIZ', choices: { A: 'yes and no', B: '1 and 0', C: 'True and False', D: 'true and false' }, correct_choice: 'C' },
    explanation: 'Python booleans are `True` and `False` — capital T and F.' },
  { type: 'QUIZ', topic: 'strings', subtopic: 'quotes', difficulty: 'easy',
    prompt: 'Which of the following is a valid Python string?',
    answer_data: { type: 'QUIZ', choices: { A: '"hello"', B: "'hello'", C: 'Both A and B', D: 'Neither' }, correct_choice: 'C' },
    explanation: 'Python strings can use either single or double quotes.' },
  { type: 'QUIZ', topic: 'operators', subtopic: 'arithmetic', difficulty: 'easy',
    prompt: 'What does the `**` operator do in Python?',
    answer_data: { type: 'QUIZ', choices: { A: 'Multiply by 2', B: 'Exponentiation (power)', C: 'Integer division', D: 'Bitwise AND' }, correct_choice: 'B' },
    explanation: '`**` is Python\'s exponentiation operator. `2 ** 3` equals 8.' },
  { type: 'QUIZ', topic: 'operators', subtopic: 'floor-division', difficulty: 'medium',
    prompt: 'What is the result of `17 // 5` in Python?',
    answer_data: { type: 'QUIZ', choices: { A: '3.4', B: '3', C: '2', D: '4' }, correct_choice: 'B' },
    explanation: '`//` is floor division — 17 ÷ 5 = 3.4, floored to 3.' },
  { type: 'QUIZ', topic: 'strings', subtopic: 'methods', difficulty: 'medium',
    prompt: 'What does `"Hello World".lower()` return?',
    answer_data: { type: 'QUIZ', choices: { A: '"HELLO WORLD"', B: '"hello world"', C: '"Hello world"', D: 'None' }, correct_choice: 'B' },
    explanation: '`.lower()` converts all characters to lowercase.' },
  { type: 'QUIZ', topic: 'comparisons', subtopic: 'equality', difficulty: 'medium',
    prompt: 'What does `5 != 5` evaluate to in Python?',
    answer_data: { type: 'QUIZ', choices: { A: 'True', B: 'False', C: '0', D: 'Error' }, correct_choice: 'B' },
    explanation: '`!=` means "not equal to". Since 5 equals 5, the result is False.' },
  { type: 'QUIZ', topic: 'variables', subtopic: 'naming', difficulty: 'medium',
    prompt: 'Which variable name is NOT valid in Python?',
    answer_data: { type: 'QUIZ', choices: { A: '_count', B: 'my_var', C: '2fast', D: 'score1' }, correct_choice: 'C' },
    explanation: 'Variable names cannot start with a digit.' },
  { type: 'QUIZ', topic: 'operators', subtopic: 'modulo', difficulty: 'hard',
    prompt: 'What is the result of `-7 % 3` in Python?',
    answer_data: { type: 'QUIZ', choices: { A: '-1', B: '2', C: '1', D: '-2' }, correct_choice: 'B' },
    explanation: 'Python\'s `%` always returns non-negative when divisor is positive. -7 = 3 × (-3) + 2.' },
  { type: 'QUIZ', topic: 'booleans', subtopic: 'short-circuit', difficulty: 'hard',
    prompt: 'What does `False and print("hi")` evaluate to?',
    answer_data: { type: 'QUIZ', choices: { A: '"hi" is printed, returns False', B: 'False (print is never called)', C: 'True', D: 'None' }, correct_choice: 'B' },
    explanation: 'Short-circuit: for `and`, if left operand is False the right side is never evaluated.' },
]

// ── LOGIC questions ────────────────────────────────────────────────────────────

const LOGIC_QUESTIONS: SeedQuestion[] = [
  { type: 'LOGIC', topic: 'if-else', subtopic: 'basic', difficulty: 'easy',
    prompt: 'Given `x = 8`, which branch executes?\n\n```python\nif x > 10:\n    print("big")\nelif x > 5:\n    print("medium")\nelse:\n    print("small")\n```',
    answer_data: { type: 'LOGIC', choices: { A: '"big"', B: '"medium"', C: '"small"', D: 'Nothing' }, correct_choice: 'B' },
    explanation: '8 is not > 10 but is > 5, so "medium" prints.' },
  { type: 'LOGIC', topic: 'range', subtopic: 'basic', difficulty: 'easy',
    prompt: 'How many times does this loop execute?\n\n```python\nfor i in range(5):\n    print(i)\n```',
    answer_data: { type: 'LOGIC', choices: { A: '4', B: '5', C: '6', D: '0' }, correct_choice: 'B' },
    explanation: '`range(5)` generates 0, 1, 2, 3, 4 — exactly 5 iterations.' },
  { type: 'LOGIC', topic: 'loops', subtopic: 'while', difficulty: 'easy',
    prompt: 'What is the final value of `count` after this code runs?\n\n```python\ncount = 0\nwhile count < 3:\n    count += 1\n```',
    answer_data: { type: 'LOGIC', choices: { A: '2', B: '3', C: '4', D: '0' }, correct_choice: 'B' },
    explanation: 'The loop increments until count reaches 3 (when `count < 3` is False).' },
  { type: 'LOGIC', topic: 'functions', subtopic: 'return', difficulty: 'easy',
    prompt: 'What does this function return when called as `add(3, 4)`?\n\n```python\ndef add(a, b):\n    return a + b\n```',
    answer_data: { type: 'LOGIC', choices: { A: '"34"', B: '7', C: 'None', D: 'Error' }, correct_choice: 'B' },
    explanation: '`a + b` with integers 3 and 4 returns 7.' },
  { type: 'LOGIC', topic: 'range', subtopic: 'step', difficulty: 'medium',
    prompt: 'What values does `range(1, 10, 3)` produce?',
    answer_data: { type: 'LOGIC', choices: { A: '1, 2, 3', B: '1, 4, 7', C: '3, 6, 9', D: '1, 3, 6, 9' }, correct_choice: 'B' },
    explanation: '`range(start, stop, step)` begins at 1, increments by 3: 1, 4, 7.' },
  { type: 'LOGIC', topic: 'if-else', subtopic: 'nested', difficulty: 'medium',
    prompt: 'What does this print when `x = 5, y = 3`?\n\n```python\nif x > y:\n    if x > 10:\n        print("large")\n    else:\n        print("medium")\nelse:\n    print("small")\n```',
    answer_data: { type: 'LOGIC', choices: { A: '"large"', B: '"medium"', C: '"small"', D: 'Nothing' }, correct_choice: 'B' },
    explanation: '5 > 3 is True; 5 > 10 is False, so "medium" prints.' },
  { type: 'LOGIC', topic: 'loops', subtopic: 'accumulator', difficulty: 'medium',
    prompt: 'What is the value of `total` after this loop completes?\n\n```python\ntotal = 0\nfor i in range(1, 6):\n    total += i\n```',
    answer_data: { type: 'LOGIC', choices: { A: '10', B: '15', C: '21', D: '5' }, correct_choice: 'B' },
    explanation: '1+2+3+4+5 = 15.' },
  { type: 'LOGIC', topic: 'functions', subtopic: 'default-args', difficulty: 'hard',
    prompt: 'What does `greet()` print?\n\n```python\ndef greet(name="World"):\n    print(f"Hello, {name}!")\n\ngreet()\n```',
    answer_data: { type: 'LOGIC', choices: { A: '"Hello, !"', B: '"Hello, World!"', C: 'Error', D: '"Hello, name!"' }, correct_choice: 'B' },
    explanation: 'Default value "World" is used when no argument is passed.' },
  { type: 'LOGIC', topic: 'loops', subtopic: 'break', difficulty: 'hard',
    prompt: 'What does this code print?\n\n```python\nfor i in range(10):\n    if i == 4:\n        break\n    print(i)\n```',
    answer_data: { type: 'LOGIC', choices: { A: '0 1 2 3 4', B: '0 1 2 3', C: '1 2 3 4', D: 'All 0-9' }, correct_choice: 'B' },
    explanation: 'print runs before break; 4 causes break before printing.' },
  { type: 'LOGIC', topic: 'functions', subtopic: 'scope', difficulty: 'hard',
    prompt: 'What does this print?\n\n```python\nx = 10\ndef change():\n    x = 20\nchange()\nprint(x)\n```',
    answer_data: { type: 'LOGIC', choices: { A: '20', B: '10', C: 'Error', D: 'None' }, correct_choice: 'B' },
    explanation: 'The `x = 20` creates a local variable; global `x` stays 10.' },
]

// ── OUTPUT questions ───────────────────────────────────────────────────────────

const OUTPUT_QUESTIONS: SeedQuestion[] = [
  { type: 'OUTPUT', topic: 'strings', subtopic: 'concatenation', difficulty: 'easy',
    prompt: 'What does this code output?\n\n```python\nfirst = "Hello"\nsecond = "World"\nprint(first + " " + second)\n```',
    instructions: 'Type the exact output.',
    answer_data: { type: 'OUTPUT', expected_output: 'Hello World' },
    explanation: 'String concatenation with `+` produces "Hello World".' },
  { type: 'OUTPUT', topic: 'integers', subtopic: 'arithmetic', difficulty: 'easy',
    prompt: 'What does this code output?\n\n```python\na = 3\nb = 4\nprint(a * b + 2)\n```',
    instructions: 'Type the exact number.',
    answer_data: { type: 'OUTPUT', expected_output: '14' },
    explanation: '3 * 4 = 12, + 2 = 14.' },
  { type: 'OUTPUT', topic: 'booleans', subtopic: 'comparison', difficulty: 'easy',
    prompt: 'What does this code output?\n\n```python\nprint(10 > 5)\n```',
    instructions: 'Type the exact output.',
    answer_data: { type: 'OUTPUT', expected_output: 'True' },
    explanation: '10 > 5 is True.' },
  { type: 'OUTPUT', topic: 'strings', subtopic: 'repetition', difficulty: 'easy',
    prompt: 'What does this code output?\n\n```python\nprint("ha" * 3)\n```',
    instructions: 'Type the exact output.',
    answer_data: { type: 'OUTPUT', expected_output: 'hahaha' },
    explanation: '"ha" * 3 = "hahaha".' },
  { type: 'OUTPUT', topic: 'loops', subtopic: 'range', difficulty: 'medium',
    prompt: 'What does this code output?\n\n```python\nresult = 0\nfor n in range(1, 4):\n    result += n * n\nprint(result)\n```',
    instructions: 'Type the exact number.',
    answer_data: { type: 'OUTPUT', expected_output: '14' },
    explanation: '1+4+9 = 14.' },
  { type: 'OUTPUT', topic: 'strings', subtopic: 'slicing', difficulty: 'medium',
    prompt: 'What does this code output?\n\n```python\nword = "Python"\nprint(word[1:4])\n```',
    instructions: 'Type the exact output.',
    answer_data: { type: 'OUTPUT', expected_output: 'yth' },
    explanation: '"Python"[1:4] = "yth" (indices 1, 2, 3).' },
  { type: 'OUTPUT', topic: 'functions', subtopic: 'return-value', difficulty: 'medium',
    prompt: 'What does this code output?\n\n```python\ndef double(n):\n    return n * 2\n\nprint(double(double(3)))\n```',
    instructions: 'Type the exact number.',
    answer_data: { type: 'OUTPUT', expected_output: '12' },
    explanation: 'double(3)=6, double(6)=12.' },
  { type: 'OUTPUT', topic: 'loops', subtopic: 'nested', difficulty: 'hard',
    prompt: 'What does this code output?\n\n```python\nfor i in range(1, 3):\n    for j in range(1, 3):\n        print(i * j, end=" ")\n```',
    instructions: 'Type the exact output (one line).',
    answer_data: { type: 'OUTPUT', expected_output: '1 2 2 4 ' },
    explanation: 'i=1,j=1→1; i=1,j=2→2; i=2,j=1→2; i=2,j=2→4. With trailing space.' },
  { type: 'OUTPUT', topic: 'variables', subtopic: 'swap', difficulty: 'hard',
    prompt: 'What does this code output?\n\n```python\na = 5\nb = 10\na, b = b, a\nprint(a, b)\n```',
    instructions: 'Type the exact output.',
    answer_data: { type: 'OUTPUT', expected_output: '10 5' },
    explanation: 'Tuple unpacking swaps values. a=10, b=5.' },
  { type: 'OUTPUT', topic: 'strings', subtopic: 'format', difficulty: 'hard',
    prompt: 'What does this code output?\n\n```python\nname = "Ada"\nage = 30\nprint(f"{name} is {age * 2} in dog years? No, {age}.")\n```',
    instructions: 'Type the exact output.',
    answer_data: { type: 'OUTPUT', expected_output: 'Ada is 60 in dog years? No, 30.' },
    explanation: 'f-strings evaluate {age * 2} = 60, {age} = 30.' },
]

const SEED_QUESTIONS: SeedQuestion[] = [
  ...CODE_QUESTIONS,
  ...DEBUG_QUESTIONS,
  ...QUIZ_QUESTIONS,
  ...LOGIC_QUESTIONS,
  ...OUTPUT_QUESTIONS,
]

// ── Seed function ──────────────────────────────────────────────────────────────

export async function seed() {
  console.log('Seeding database...')

  initDb()

  // Check if already seeded
  const existing = db.select().from(boards).all()
  if (existing.length > 0) {
    console.log('Database already seeded, skipping.')
    return
  }

  const boardId = randomUUID()

  db.insert(boards).values({ id: boardId, name: 'Classic Codepoly', version: 1, active: true }).run()

  const nodeIds: Record<number, string> = {}
  for (const node of BOARD_NODES) {
    const id = randomUUID()
    nodeIds[node.key] = id
    db.insert(board_nodes).values({
      id,
      board_id: boardId,
      node_key: node.key,
      type: node.type,
      label: node.label,
      topic: node.topic ?? null,
      metadata: null,
    }).run()
  }

  // Ring edges: each node → next (wrapping 31→0)
  for (let i = 0; i < 32; i++) {
    const from = nodeIds[i]
    const to = nodeIds[(i + 1) % 32]
    db.insert(board_edges).values({
      id: randomUUID(),
      board_id: boardId,
      from_node_id: from,
      to_node_id: to,
      metadata: JSON.stringify({ label: 'main' }),
    }).run()
  }

  // Fork edge: node 4 → node 8 (skip nodes 5, 6, 7)
  db.insert(board_edges).values({
    id: randomUUID(),
    board_id: boardId,
    from_node_id: nodeIds[4],
    to_node_id: nodeIds[8],
    metadata: JSON.stringify({ label: 'fork', is_fork: true }),
  }).run()

  // Questions
  for (const q of SEED_QUESTIONS) {
    const qId = randomUUID()
    db.insert(questions).values({
      id: qId,
      type: q.type,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      active: true,
    }).run()

    db.insert(question_versions).values({
      id: randomUUID(),
      question_id: qId,
      version: 1,
      prompt: q.prompt,
      instructions: q.instructions ?? null,
      answer_data: q.answer_data as unknown as string,
      explanation: q.explanation,
    }).run()
  }

  console.log(`Seeded: 1 board, 32 nodes, ${SEED_QUESTIONS.length} questions`)
}

// Run directly: tsx server/db/seed.ts
const isMain = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')
if (isMain) {
  seed().catch(console.error)
}
