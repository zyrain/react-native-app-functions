"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeExpr = encodeExpr;
exports.decodeExpr = decodeExpr;
exports.jsonFile = jsonFile;
const shared_1 = require("./shared");
/**
 * Kotlin expression encoding [x] (of type [v]) into a value `JSONObject.put` accepts.
 * Wire format: dates and times as ISO-8601 strings, lists as arrays, declared types as objects.
 */
function encodeExpr(v, x, prefix) {
    const item = (t, y) => t.kind === 'named'
        ? `${prefix}encode${t.name}(${y})`
        : ['localDate', 'localDateTime', 'instant'].includes(t.scalar)
            ? `${y}.toString()`
            : y;
    const nonNull = (y) => v.list
        ? item(v.item, 'item') === 'item'
            ? `JSONArray(${y})`
            : `JSONArray(${y}.map { item -> ${item(v.item, 'item')} })`
        : item(v.item, y);
    if (!v.nullable)
        return nonNull(x);
    return nonNull('it') === 'it'
        ? `${x} ?: JSONObject.NULL`
        : `${x}?.let { ${nonNull('it')} } ?: JSONObject.NULL`;
}
/** Kotlin expression decoding [src] (a parsed JSON value) into type [v], failing with [path]. */
function decodeExpr(v, src, path, prefix) {
    const item = (t, y, p) => t.kind === 'named'
        ? `${prefix}decode${t.name}(${y}, ${p})`
        : `${prefix}${t.scalar}(${y}, ${p})`;
    const nonNull = (y) => v.list
        ? `${prefix}list(${y}, ${path}) { item, itemPath -> ${item(v.item, 'item', 'itemPath')} }`
        : item(v.item, y, path);
    return v.nullable
        ? `${prefix}orNull(${src}) { ${nonNull('it')} }`
        : nonNull(src);
}
function typeCodec(t) {
    const puts = t.fields
        .map((f) => `    o.put("${f.name}", ${encodeExpr(f.value, `v.${f.name}`, '')})\n`)
        .join('');
    const args = t.fields
        .map((f) => `      ${f.name} = ${decodeExpr(f.value, `o.opt("${f.name}")`, `"$path.${f.name}"`, '')},\n`)
        .join('');
    return `
  fun encode${t.name}(v: ${t.name}): JSONObject {
    val o = JSONObject()
${puts}    return o
  }

  fun decode${t.name}(v: Any?, path: String): ${t.name} {
    val o = obj(v, path)
    return ${t.name}(
${args}    )
  }
`;
}
/** `AppFunctionsJson.kt`: generated only when the config has `js` functions. */
function jsonFile(m) {
    return `${shared_1.KOTLIN_HEADER}
package ${m.kotlinPackage}

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeParseException
import org.json.JSONArray
import org.json.JSONObject

${(0, shared_1.kdoc)([
        'JSON encoding for values exchanged with JS handlers. Dates and times are ISO-8601 strings;',
        'decoding is strict and reports the path of the first invalid value.',
    ], '')}internal object AppFunctionsJson {
  class InvalidValueException(message: String) : Exception(message)
${m.types.map(typeCodec).join('')}${HELPERS}}
`;
}
// Fixed helpers. String.raw keeps Kotlin's backslashes; ${'$'} emits a literal "$".
const HELPERS = String.raw `
  fun isNull(v: Any?): Boolean = v == null || v == JSONObject.NULL

  inline fun <T> orNull(v: Any?, decode: (Any) -> T): T? = if (v == null || isNull(v)) null else decode(v)

  fun obj(v: Any?, path: String): JSONObject = v as? JSONObject ?: invalid(path, "an object", v)

  fun string(v: Any?, path: String): String = v as? String ?: invalid(path, "a string", v)

  fun boolean(v: Any?, path: String): Boolean = v as? Boolean ?: invalid(path, "a boolean", v)

  fun double(v: Any?, path: String): Double = (v as? Number)?.toDouble() ?: invalid(path, "a number", v)

  fun long(v: Any?, path: String): Long =
    when (v) {
      is Int -> v.toLong()
      is Long -> v
      is Number ->
        v.toDouble().let { d ->
          if (d % 1.0 == 0.0 && d >= Long.MIN_VALUE.toDouble() && d <= Long.MAX_VALUE.toDouble()) {
            d.toLong()
          } else {
            invalid(path, "an integer", v)
          }
        }
      else -> invalid(path, "an integer", v)
    }

  fun int(v: Any?, path: String): Int {
    val l = long(v, path)
    if (l < Int.MIN_VALUE || l > Int.MAX_VALUE) invalid(path, "a 32-bit integer", v)
    return l.toInt()
  }

  fun localDate(v: Any?, path: String): LocalDate =
    parse(v, path, "an ISO-8601 date like 2026-10-10") { LocalDate.parse(it) }

  fun localDateTime(v: Any?, path: String): LocalDateTime =
    parse(v, path, "an ISO-8601 local date-time like 2026-10-10T08:30") { LocalDateTime.parse(it) }

  fun instant(v: Any?, path: String): Instant =
    parse(v, path, "an ISO-8601 instant like 2026-10-10T08:30:00Z") { Instant.parse(it) }

  inline fun <T> list(v: Any?, path: String, item: (Any?, String) -> T): List<T> {
    val a = v as? JSONArray ?: invalid(path, "an array", v)
    return List(a.length()) { i -> item(a.opt(i), "$path[$i]") }
  }

  inline fun <T> parse(v: Any?, path: String, expected: String, parse: (String) -> T): T {
    val s = string(v, path)
    return try {
      parse(s)
    } catch (e: DateTimeParseException) {
      invalid(path, expected, v)
    }
  }

  fun invalid(path: String, expected: String, v: Any?): Nothing =
    throw InvalidValueException(
      if (isNull(v)) "$path is missing or null, expected $expected"
      else "$path: expected $expected, got ${'$'}{describe(v)}"
    )

  private fun describe(v: Any?): String =
    when (v) {
      is JSONObject -> "an object"
      is JSONArray -> "an array"
      is String -> "\"${'$'}{v.take(40)}\""
      else -> v.toString()
    }
`;
