package app.daynori.vault.candidate

import java.io.File
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Base64
import kotlin.system.exitProcess

private var failures = 0

private fun check(name: String, condition: Boolean, detail: String = "") {
    if (condition) {
        println("[PASS] $name")
    } else {
        failures += 1
        println("[FAIL] $name${if (detail.isNotEmpty()) " — $detail" else ""}")
    }
}

fun main(args: Array<String>) {
    println("Daynori vault Android/JVM candidate harness (Phase 44)")
    println("java.version=${System.getProperty("java.version")}")
    println("os.name=${System.getProperty("os.name")}")
    println("note=JVM execution is NOT a substitute for physical Android device evidence")
    println()

    val ctx = VaultContext(
        workspaceId = "11111111-1111-4111-8111-111111111111",
        itemId = "22222222-2222-4222-8222-222222222222",
        itemType = "vault_note",
        schemaVersion = 1,
        keyVersion = 1,
    )

    // McGrew/Viega GCM Appendix B Cases 13–14 use empty AAD (not vault context AAD).
    run {
        val key = ByteArray(32)
        val iv = ByteArray(12)
        val (_, tag13) = encryptAesGcmRaw(ByteArray(0), key, iv, ByteArray(0))
        check(
            "McGrew/Viega Appendix B Case 13 tag",
            bytesToHex(tag13) == "530f8afbc74536b9a963b4f1c4cb738b",
        )
        val (ct14, tag14) = encryptAesGcmRaw(ByteArray(16), key, iv, ByteArray(0))
        check(
            "McGrew/Viega Appendix B Case 14 ciphertext",
            bytesToHex(ct14) == "cea7403d4d606b6e074ec5d3baf39d18",
        )
        check(
            "McGrew/Viega Appendix B Case 14 tag",
            bytesToHex(tag14) == "d0d1c8a799996bf0265b98b5d48ab919",
        )
    }

    val key = ByteArray(32).also { SecureRandom().nextBytes(it) }
    val unicode = "গোপন ভল্ট ডেটা - Synthetic Vault Content 🚀🔒".toByteArray(StandardCharsets.UTF_8)
    val envUnicode = encryptAesGcm(unicode, key, ctx)
    val roundUnicode = decryptAesGcm(envUnicode, key, ctx)
    check("Unicode round-trip", roundUnicode.contentEquals(unicode))

    val binary = ByteArray(4096).also { SecureRandom().nextBytes(it) }
    check("Binary round-trip", decryptAesGcm(encryptAesGcm(binary, key, ctx), key, ctx).contentEquals(binary))

    val emptyEnv = encryptAesGcm(ByteArray(0), key, ctx)
    check("Empty payload ciphertext empty string", emptyEnv.ciphertextB64.isEmpty())
    check("Empty payload tag length 16", Base64.getDecoder().decode(emptyEnv.tagB64).size == 16)
    check("Empty payload round-trip", decryptAesGcm(emptyEnv, key, ctx).isEmpty())

    // Tamper
    run {
        val env = encryptAesGcm("sensitive".toByteArray(), key, ctx)
        val ct = Base64.getDecoder().decode(env.ciphertextB64)
        ct[0] = (ct[0].toInt() xor 0x01).toByte()
        val tampered = env.copy(ciphertextB64 = Base64.getEncoder().encodeToString(ct))
        val rejected = try {
            decryptAesGcm(tampered, key, ctx)
            false
        } catch (_: Exception) {
            true
        }
        check("Ciphertext tamper rejected", rejected)
    }

    // Malformed: 16-byte key
    run {
        val rejected = try {
            encryptAesGcm("x".toByteArray(), ByteArray(16), ctx)
            false
        } catch (_: Exception) {
            true
        }
        check("Reject 16-byte key", rejected)
    }

    // Key wrap purpose simulation: wrap 32-byte DEK
    run {
        val vrk = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val dek = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val wrapCtx = ctx.copy(itemType = "wrap:dek_under_vrk")
        val wrapped = encryptAesGcm(dek, vrk, wrapCtx)
        val unwrapped = decryptAesGcm(wrapped, vrk, wrapCtx)
        check("DEK wrap/unwrap", unwrapped.contentEquals(dek))
    }

    // Argon2id candidate (test profile 16 MiB for CI speed; also sample production params once)
    run {
        // Synthetic KDF input only (not a credential).
        val kdfInput = ("correct-horse-battery-staple-" + "synthetic").toByteArray(StandardCharsets.UTF_8)
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val k1 = deriveArgon2id(kdfInput, salt, 16_384, 2, 1, 32)
        val k2 = deriveArgon2id(kdfInput, salt, 16_384, 2, 1, 32)
        check("Argon2id deterministic", k1.contentEquals(k2))
        check("Argon2id length 32", k1.size == 32)

        val times = benchmarkArgon2idMs(password, salt, 16_384, 2, 1, samples = 3)
        println("[META] Argon2id test-profile latency ms min=${times.minOrNull()} avg=${times.average()} max=${times.maxOrNull()}")
        println("[META] Argon2id note: desktop/JVM latency does not establish Android device performance or GPU/ASIC resistance")
    }

    // Optional: load shared fixtures file if present
    val fixtureCandidates = listOfNotNull(
        args.getOrNull(0)?.let(::File),
        File("../shared-fixtures.json"),
        File("../../shared-fixtures.json"),
        File("tests/security/vault/harnesses/shared-fixtures.json"),
    )
    val fixtures = fixtureCandidates.firstOrNull { it.exists() }
    if (fixtures != null) {
        println("[META] shared-fixtures present at ${fixtures.absolutePath}")
        check("shared-fixtures readable", fixtures.readText().contains("mcgrewViegaGcmAppendixB"))
    } else {
        println("[META] shared-fixtures.json not found beside module (optional)")
    }

    println()
    if (failures == 0) {
        println("HARNESS RESULT: PASS")
        exitProcess(0)
    } else {
        println("HARNESS RESULT: FAIL ($failures)")
        exitProcess(1)
    }
}
