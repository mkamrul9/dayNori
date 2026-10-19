package app.daynori.vault.candidate

import java.io.File

/**
 * Minimal JSON reader for the shared vault harness fixtures.
 * Avoids pulling a full JSON library into the isolated candidate.
 */
data class McGrewCase(
    val keyHex: String,
    val ivHex: String,
    val ptHex: String,
    val aadHex: String,
    val ctHex: String,
    val tagHex: String,
)

data class CrossImplVector(
    val ptHex: String?,
    val ptUtf8: String?,
    val ctHex: String,
    val tagHex: String,
)

data class SharedFixtures(
    val sampleContext: VaultContext,
    val canonicalAad: String,
    val canonicalAadUtf8Hex: String,
    val case13: McGrewCase,
    val case14: McGrewCase,
    val crossKeyHex: String,
    val crossNonceHex: String,
    val crossEmpty: CrossImplVector,
    val crossUnicode: CrossImplVector,
    val crossBinary: CrossImplVector,
    val argon2PasswordHex: String,
    val argon2SaltHex: String,
    val argon2MemoryKiB: Int,
    val argon2Passes: Int,
    val argon2Parallelism: Int,
    val argon2ExpectedHex: String,
    val argon2AppPasswordUtf8: String,
    val argon2AppSaltHex: String,
    val argon2AppMemoryKiB: Int,
    val argon2AppPasses: Int,
    val argon2AppParallelism: Int,
    val argon2AppExpectedHex: String,
)

private fun extractObject(json: String, key: String): String {
    val pattern = Regex("\"${Regex.escape(key)}\"\\s*:\\s*\\{")
    val match = pattern.find(json) ?: throw IllegalArgumentException("Missing object key: $key")
    var i = match.range.last
    var depth = 0
    val start = i
    while (i < json.length) {
        when (json[i]) {
            '{' -> depth++
            '}' -> {
                depth--
                if (depth == 0) return json.substring(start, i + 1)
            }
        }
        i++
    }
    throw IllegalArgumentException("Unclosed object for key: $key")
}

private fun extractString(obj: String, key: String): String {
    val pattern = Regex("\"${Regex.escape(key)}\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"")
    val match = pattern.find(obj) ?: throw IllegalArgumentException("Missing string key: $key")
    return match.groupValues[1]
        .replace("\\n", "\n")
        .replace("\\\"", "\"")
        .replace("\\\\", "\\")
}

private fun extractInt(obj: String, key: String): Int {
    val pattern = Regex("\"${Regex.escape(key)}\"\\s*:\\s*(-?\\d+)")
    val match = pattern.find(obj) ?: throw IllegalArgumentException("Missing int key: $key")
    return match.groupValues[1].toInt()
}

private fun parseMcGrew(obj: String): McGrewCase =
    McGrewCase(
        keyHex = extractString(obj, "keyHex"),
        ivHex = extractString(obj, "ivHex"),
        ptHex = extractString(obj, "ptHex"),
        aadHex = extractString(obj, "aadHex"),
        ctHex = extractString(obj, "ctHex"),
        tagHex = extractString(obj, "tagHex"),
    )

private fun parseCross(obj: String): CrossImplVector =
    CrossImplVector(
        ptHex = runCatching { extractString(obj, "ptHex") }.getOrNull(),
        ptUtf8 = runCatching { extractString(obj, "ptUtf8") }.getOrNull(),
        ctHex = extractString(obj, "ctHex"),
        tagHex = extractString(obj, "tagHex"),
    )

fun loadSharedFixtures(file: File): SharedFixtures {
    require(file.exists()) { "Required shared fixtures missing: ${file.absolutePath}" }
    return loadSharedFixturesJson(file.readText(Charsets.UTF_8))
}

fun loadSharedFixturesJson(json: String): SharedFixtures {

    val sample = extractObject(json, "sampleContext")
    val ctx = VaultContext(
        workspaceId = extractString(sample, "workspaceId"),
        itemId = extractString(sample, "itemId"),
        itemType = extractString(sample, "itemType"),
        schemaVersion = extractInt(sample, "schemaVersion"),
        keyVersion = extractInt(sample, "keyVersion"),
    )

    val mcg = extractObject(json, "mcgrewViegaGcmAppendixB")
    val case13 = parseMcGrew(extractObject(mcg, "case13"))
    val case14 = parseMcGrew(extractObject(mcg, "case14"))

    val cross = extractObject(json, "crossImplAesGcm")
    val argon = extractObject(json, "argon2idPasswordSaltOnlyRegression")
    val argonApp = extractObject(json, "argon2idFixedApplicationBounds")

    return SharedFixtures(
        sampleContext = ctx,
        canonicalAad = extractString(json, "canonicalAad"),
        canonicalAadUtf8Hex = extractString(json, "canonicalAadUtf8Hex"),
        case13 = case13,
        case14 = case14,
        crossKeyHex = extractString(cross, "keyHex"),
        crossNonceHex = extractString(cross, "nonceHex"),
        crossEmpty = parseCross(extractObject(cross, "empty")),
        crossUnicode = parseCross(extractObject(cross, "unicode")),
        crossBinary = parseCross(extractObject(cross, "binary")),
        argon2PasswordHex = extractString(argon, "passwordHex"),
        argon2SaltHex = extractString(argon, "saltHex"),
        argon2MemoryKiB = extractInt(argon, "memoryKiB"),
        argon2Passes = extractInt(argon, "passes"),
        argon2Parallelism = extractInt(argon, "parallelism"),
        argon2ExpectedHex = extractString(argon, "expectedHex"),
        argon2AppPasswordUtf8 = extractString(argonApp, "passwordUtf8"),
        argon2AppSaltHex = extractString(argonApp, "saltHex"),
        argon2AppMemoryKiB = extractInt(argonApp, "memoryKiB"),
        argon2AppPasses = extractInt(argonApp, "passes"),
        argon2AppParallelism = extractInt(argonApp, "parallelism"),
        argon2AppExpectedHex = extractString(argonApp, "expectedHex"),
    )
}

fun resolveSharedFixturesFile(args: Array<String>): File {
    val candidates = listOfNotNull(
        args.getOrNull(0)?.let(::File),
        File("../shared-fixtures.json"),
        File("../../shared-fixtures.json"),
        File("tests/security/vault/harnesses/shared-fixtures.json"),
    )
    return candidates.firstOrNull { it.exists() }
        ?: throw IllegalStateException(
            "Required shared-fixtures.json not found. Tried: ${candidates.joinToString { it.path }}"
        )
}
