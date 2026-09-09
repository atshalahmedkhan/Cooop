#!/usr/bin/env python3
"""
Codepoly Python sandbox runner.
Reads JSON from stdin: {code, tests, mode}
Writes JSON to stdout: {results, error}

Security: restricted builtins, blocked module imports, output size limit,
resource limits. Node.js parent enforces hard wall-clock timeout + SIGKILL.
"""
import sys
import json
import io
import builtins
import traceback

MAX_CODE_BYTES = 20_000
MAX_OUTPUT_PER_TEST = 2_048
MAX_TOTAL_OUTPUT = 32_768

BLOCKED_MODULES = frozenset({
    "os", "subprocess", "sys", "socket", "urllib", "http", "ftplib",
    "smtplib", "poplib", "imaplib", "telnetlib", "xmlrpc",
    "shutil", "pathlib", "glob", "ctypes", "signal", "resource",
    "importlib", "pkgutil", "inspect", "ast", "code", "codeop",
    "py_compile", "compileall", "dis", "pickle", "shelve", "marshal",
    "multiprocessing", "threading", "concurrent", "asyncio",
    "_thread", "gc", "weakref", "copyreg",
    "pty", "tty", "termios", "fcntl", "grp", "pwd", "crypt",
    "mmap", "select", "selectors", "ssl", "struct",
    "zipfile", "tarfile", "gzip", "bz2", "lzma", "zlib",
    "faulthandler", "tracemalloc", "linecache",
})

ALLOWED_MODULES = frozenset({
    "math", "random", "collections", "itertools", "functools",
    "operator", "string", "textwrap", "decimal", "fractions",
    "statistics", "re", "json", "copy", "pprint", "typing",
    "dataclasses", "enum", "heapq", "bisect", "abc",
    "datetime", "time",
})

_orig_import = builtins.__import__


def _safe_import(name, *args, **kwargs):
    base = name.split(".")[0]
    if base in BLOCKED_MODULES:
        raise ImportError(f"Module '{name}' is not available in the sandbox")
    if base not in ALLOWED_MODULES and not base.startswith("_builtins"):
        raise ImportError(f"Module '{name}' is not available in the sandbox")
    return _orig_import(name, *args, **kwargs)


BLOCKED_BUILTINS = frozenset({
    "open", "exec", "eval", "compile", "input", "breakpoint",
    "__import__", "reload", "memoryview",
})


def make_safe_builtins():
    safe = {}
    for name in dir(builtins):
        if name not in BLOCKED_BUILTINS:
            attr = getattr(builtins, name)
            safe[name] = attr
    safe["__import__"] = _safe_import
    return safe


class LimitedIO(io.StringIO):
    def __init__(self, limit):
        super().__init__()
        self._limit = limit
        self._total = 0

    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        if self._total >= self._limit:
            raise RuntimeError(f"Output limit ({self._limit} chars) exceeded")
        remaining = self._limit - self._total
        if len(s) > remaining:
            s = s[:remaining]
        n = super().write(s)
        self._total += n
        return n


def run_single_test(compiled_code, test_input, safe_builtins):
    """Execute student code then the test call. Return (output, error_str)."""
    ns = {"__builtins__": safe_builtins, "__name__": "__student__"}
    capture = LimitedIO(MAX_OUTPUT_PER_TEST)
    _real_stdout = sys.stdout
    sys.stdout = capture
    try:
        exec(compiled_code, ns)  # noqa: S102 – intentional sandboxed exec
        if test_input and test_input.strip():
            test_compiled = compile(test_input.strip(), "<test>", "exec")
            exec(test_compiled, ns)  # noqa: S102
        return capture.getvalue().strip(), None
    except RecursionError:
        return capture.getvalue().strip(), "RecursionError: maximum recursion depth exceeded"
    except MemoryError:
        return "", "MemoryError: memory limit exceeded"
    except RuntimeError as e:
        return capture.getvalue().strip(), f"RuntimeError: {e}"
    except Exception as e:
        return capture.getvalue().strip(), f"{type(e).__name__}: {e}"
    finally:
        sys.stdout = _real_stdout


def main():
    try:
        raw = sys.stdin.read(MAX_CODE_BYTES + 4096)
    except Exception as e:
        print(json.dumps({"error": f"Failed to read input: {e}", "results": []}))
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}", "results": []}))
        return

    code = payload.get("code", "")
    tests = payload.get("tests", [])
    mode = payload.get("mode", "run")  # "run" | "submit"

    if len(code) > MAX_CODE_BYTES:
        print(json.dumps({"error": "Code too large (max 20 KB)", "results": []}))
        return

    safe_builtins = make_safe_builtins()

    # Syntax check first
    try:
        compiled = compile(code, "<student>", "exec")
    except SyntaxError as e:
        error_msg = f"SyntaxError: {e.msg} (line {e.lineno})"
        results = []
        for test in tests:
            is_hidden = test.get("is_hidden", False)
            if is_hidden and mode != "submit":
                continue
            results.append({
                "passed": False,
                "output": "",
                "expected": "" if is_hidden else test.get("expected_output", ""),
                "hidden": is_hidden,
                "error": error_msg,
            })
        print(json.dumps({"results": results, "error": error_msg}))
        return

    results = []
    for test in tests:
        is_hidden = test.get("is_hidden", False)
        if is_hidden and mode != "submit":
            continue

        test_input = test.get("input", "")
        expected = test.get("expected_output", "").strip()
        actual, error = run_single_test(compiled, test_input, safe_builtins)
        passed = error is None and actual == expected

        result = {
            "passed": passed,
            "output": actual[:500],
            "expected": expected if not is_hidden else "",
            "hidden": is_hidden,
            "error": error,
        }
        if not passed and not is_hidden and test.get("hint"):
            result["hint"] = test["hint"]
        results.append(result)

    print(json.dumps({"results": results, "error": None}))


if __name__ == "__main__":
    main()
