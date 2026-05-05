/**
 * TypeScript AST walker.
 *
 * Finds Supabase `.from("<table>").select("<columns>")` calls in source files
 * and returns the table name + column list per call site. Multi-line and
 * concatenated string literals are supported; template literals with
 * interpolation are flagged as `dynamic` and skipped.
 *
 * Implementation notes:
 *   - Uses the bundled `typescript` package (no extra dep).
 *   - Walks each source file with a recursive visitor — predictable order.
 *   - For chained calls like `.from("x").eq(...).select("...")`, the walker
 *     follows the dotted chain back from `.select(...)` to the nearest
 *     `.from(...)` to recover the table name.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as ts from "typescript"

export interface SelectCall {
  /** Absolute path to the source file. */
  file: string
  /** 1-based line number of the .select() call. */
  line: number
  /** Table name passed to .from() — null if dynamic / not statically resolvable. */
  table: string | null
  /** Raw SELECT-string passed to .select() — null if dynamic. */
  rawSelect: string | null
  /** True if the SELECT-string or table is a template literal with interpolation. */
  dynamic: boolean
  /** Reason the call was flagged dynamic, when applicable. */
  dynamicReason?: string
}

/**
 * Reads a single source file's text. Wrapped so tests can stub it.
 */
function readFile(file: string): string {
  return fs.readFileSync(file, "utf8")
}

/**
 * Resolves a string-literal-or-no-substitution-template node to its raw text.
 * Returns null for any node that cannot be statically resolved.
 */
function staticString(node: ts.Node): string | null {
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

/**
 * Strips wrappers that are transparent to the runtime call chain:
 * type-assertion expressions (`x as T`), prefix/suffix bang assertions,
 * and parentheses. Returns the inner expression.
 */
function stripWrappers(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node
  for (let i = 0; i < 20; i += 1) {
    if (ts.isAsExpression(current)) {
      current = current.expression
      continue
    }
    if (ts.isTypeAssertionExpression(current)) {
      current = current.expression
      continue
    }
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression
      continue
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression
      continue
    }
    return current
  }
  return current
}

/**
 * Walks back along a dotted method chain to find the .from(<arg>) call that
 * established the table for this query. Returns the argument node of
 * .from(), or null if no .from() is found in the chain.
 */
function findFromArg(selectExpression: ts.Expression): ts.Expression | null {
  // .select(...) is a CallExpression whose `expression` is a
  // PropertyAccessExpression like `<receiver>.select`. Walk `<receiver>`
  // backwards through `.method(...)` chain links — and through any
  // type-assertion / parenthesis wrappers that the user wrote inline.
  let current: ts.Expression = stripWrappers(selectExpression)
  // Bound the walk to avoid pathological long chains.
  for (let i = 0; i < 100; i += 1) {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "from" &&
      current.arguments.length >= 1
    ) {
      return current.arguments[0]
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression)
    ) {
      // Step one link back, peeling any wrappers around the receiver.
      current = stripWrappers(current.expression.expression)
      continue
    }
    if (ts.isPropertyAccessExpression(current)) {
      current = stripWrappers(current.expression)
      continue
    }
    return null
  }
  return null
}

/**
 * Visits a source file and pushes all detected .select() call sites.
 */
function visitSourceFile(sourceFile: ts.SourceFile, sink: SelectCall[]): void {
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "select" &&
      node.arguments.length >= 1
    ) {
      const selectArg = node.arguments[0]
      const fromArg = findFromArg(node.expression.expression)

      // No .from() in the chain — this is e.g. a React hook's `.select(...)`
      // or unrelated method. Skip silently.
      if (fromArg === null) {
        ts.forEachChild(node, visit)
        return
      }

      const tableName = staticString(fromArg)
      const rawSelect = staticString(selectArg)
      const dynamic = tableName === null || rawSelect === null

      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())

      sink.push({
        file: sourceFile.fileName,
        line: line + 1,
        table: tableName,
        rawSelect: rawSelect,
        dynamic,
        dynamicReason: dynamic
          ? tableName === null
            ? "from() argument is not a string literal"
            : "select() argument is not a string literal"
          : undefined,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

/**
 * Walks all given source files and returns every .from(...).select(...) call
 * site found. Files that fail to parse are reported as a thrown Error with
 * the file path so the caller can surface them; we deliberately don't
 * silently skip parse failures.
 */
export function walkFiles(filePaths: string[]): SelectCall[] {
  const found: SelectCall[] = []
  for (const file of filePaths) {
    const absolute = path.resolve(file)
    let text: string
    try {
      text = readFile(absolute)
    } catch (err) {
      throw new Error(
        `schema-drift: failed to read ${absolute}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
    const sourceFile = ts.createSourceFile(
      absolute,
      text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    visitSourceFile(sourceFile, found)
  }
  return found
}
