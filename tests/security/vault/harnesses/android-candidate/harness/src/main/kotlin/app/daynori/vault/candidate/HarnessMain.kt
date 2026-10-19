package app.daynori.vault.candidate

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

private fun expectReject(name: String, block: () -> Unit) {
    val rejected = try {
        block()
        false
    } catch (_: Exception) {
        true
    }
    check(name, rejected)
}

private fun plaintextOf(vector: CrossImplVector): ByteArray =
    when {
        vector.ptUtf8 != null -> vector.ptUtf8.toByteArray(StandardCharsets.UTF_8)
        vector.ptHex != null -> hexToBytes(vector.ptHex)
        else -> throw IllegalArgumentException("Vector missing plaintext")
    }

private fun verifyCrossImplDirection(
    label: String,
    fixtures: SharedFixtures,
    vector: CrossImplVector,
) {
    val key = hexToBytes(fixtures.crossKeyHex)
    val nonce = hexToBytes(fixtures.crossNonceHex)
    val ctx = fixtures.sampleContext
    val pt = plaintextOf(vector)
    val expectedCt = hexToBytes(vector.ctHex)
    val expectedTag = hexToBytes(vector.tagHex)

    // Direction A: decrypt independently established Node ciphertext on JVM.
    val foreign = envelopeFromParts(ctx, nonce, expectedCt, expectedTag)
    val decrypted = decryptAesGcm(foreign, key, ctx)
    check("$label decrypt Node→JVM", decrypted.contentEquals(pt))

    // Direction B: JVM encrypt with same fixture key/nonce must match expected bytes.
    val produced = encryptAesGcm(pt, key, ctx, nonce)
    val producedCt =
        if (produced.ciphertextB64.isEmpty()) ByteArray(0) else Base64.getDecoder().decode(produced.ciphertextB64)
    check(
        "$label encrypt JVM→expected",
        producedCt.contentEquals(expectedCt) &&
            bytesToHex(Base64.getDecoder().decode(produced.tagB64)) == vector.tagHex,
        "ctHex=${bytesToHex(producedCt)} tag=${produced.tagB64}",
    )
}

fun main(args: Array<String>) {
    println("Daynori vault Android/JVM candidate harness (Phase 44)")
    println("java.version=${System.getProperty("java.version")}")
    println("os.name=${System.getProperty("os.name")}")
    println("note=JVM execution is NOT a substitute for physical Android device evidence")
    println()

    val fixturesFile = try {
        resolveSharedFixturesFile(args)
    } catch (e: Exception) {
        println("[FAIL] required shared fixtures: ${e.message}")
        println("HARNESS RESULT: FAIL (1)")
        exitProcess(1)
    }
    println("[META] shared-fixtures=${fixturesFile.absolutePath}")

    val fixtures = try {
        loadSharedFixtures(fixturesFile)
    } catch (e: Exception) {
        println("[FAIL] shared fixtures parse: ${e.message}")
        println("HARNESS RESULT: FAIL (1)")
        exitProcess(1)
    }

    val ctx = fixtures.sampleContext
    check("canonical AAD string", canonicalAad(ctx) == fixtures.canonicalAad)
    check(
        "canonical AAD UTF-8 bytes",
        bytesToHex(canonicalAad(ctx).toByteArray(StandardCharsets.UTF_8)) == fixtures.canonicalAadUtf8Hex,
    )

    // McGrew/Viega from parsed fixtures (expected-byte comparisons).
    run {
        val c13 = fixtures.case13
        val (_, tag13) = encryptAesGcmRaw(
            hexToBytes(c13.ptHex),
            hexToBytes(c13.keyHex),
            hexToBytes(c13.ivHex),
            hexToBytes(c13.aadHex),
        )
        check("McGrew/Viega Appendix B Case 13 tag", bytesToHex(tag13) == c13.tagHex)
        val (ct14, tag14) = encryptAesGcmRaw(
            hexToBytes(fixtures.case14.ptHex),
            hexToBytes(fixtures.case14.keyHex),
            hexToBytes(fixtures.case14.ivHex),
            hexToBytes(fixtures.case14.aadHex),
        )
        check("McGrew/Viega Appendix B Case 14 ciphertext", bytesToHex(ct14) == fixtures.case14.ctHex)
        check("McGrew/Viega Appendix B Case 14 tag", bytesToHex(tag14) == fixtures.case14.tagHex)
    }

    verifyCrossImplDirection("Empty payload", fixtures, fixtures.crossEmpty)
    verifyCrossImplDirection("Unicode payload", fixtures, fixtures.crossUnicode)
    verifyCrossImplDirection("Binary payload", fixtures, fixtures.crossBinary)

    // Random-key round trips (same-library) still useful; not a substitute for cross-impl above.
    run {
        val key = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val unicode = fixtures.crossUnicode.ptUtf8!!.toByteArray(StandardCharsets.UTF_8)
        check("Unicode same-library round-trip", decryptAesGcm(encryptAesGcm(unicode, key, ctx), key, ctx).contentEquals(unicode))
        val binary = ByteArray(4096).also { SecureRandom().nextBytes(it) }
        check("Binary same-library round-trip", decryptAesGcm(encryptAesGcm(binary, key, ctx), key, ctx).contentEquals(binary))
        check("Empty same-library round-trip", decryptAesGcm(encryptAesGcm(ByteArray(0), key, ctx), key, ctx).isEmpty())
    }

    // Wrong key / wrong context / malformed / tamper
    run {
        val key = hexToBytes(fixtures.crossKeyHex)
        val env = envelopeFromParts(
            ctx,
            hexToBytes(fixtures.crossNonceHex),
            hexToBytes(fixtures.crossBinary.ctHex),
            hexToBytes(fixtures.crossBinary.tagHex),
        )
        val wrongKey = key.copyOf().also { it[0] = (it[0].toInt() xor 0x01).toByte() }
        expectReject("Wrong key rejected") { decryptAesGcm(env, wrongKey, ctx) }
        expectReject("Wrong context AAD rejected") {
            decryptAesGcm(env, key, ctx.copy(itemId = "33333333-3333-4333-8333-333333333333"))
        }
        val ct = hexToBytes(fixtures.crossBinary.ctHex).copyOf()
        ct[0] = (ct[0].toInt() xor 0x01).toByte()
        expectReject("Ciphertext tamper rejected") {
            decryptAesGcm(envelopeFromParts(ctx, hexToBytes(fixtures.crossNonceHex), ct, hexToBytes(fixtures.crossBinary.tagHex)), key, ctx)
        }
        expectReject("Reject 16-byte key") {
            encryptAesGcm("x".toByteArray(), ByteArray(16), ctx)
        }
        expectReject("Malformed empty nonce rejected") {
            decryptAesGcm(env.copy(nonceB64 = ""), key, ctx)
        }
    }

    // Key wrap purpose simulation
    run {
        val vrk = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val dek = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val wrapCtx = ctx.copy(itemType = "wrap:dek_under_vrk")
        val wrapped = encryptAesGcm(dek, vrk, wrapCtx)
        check("DEK wrap/unwrap", decryptAesGcm(wrapped, vrk, wrapCtx).contentEquals(dek))
    }

    // Argon2id: independently established expected outputs (not only repeated KDF equality).
    run {
        val ref = deriveArgon2idReferenceVector(
            hexToBytes(fixtures.argon2PasswordHex),
            hexToBytes(fixtures.argon2SaltHex),
            fixtures.argon2MemoryKiB,
            fixtures.argon2Passes,
            fixtures.argon2Parallelism,
            32,
        )
        check(
            "Argon2id password+salt-only expected bytes",
            bytesToHex(ref) == fixtures.argon2ExpectedHex,
            "got=${bytesToHex(ref)}",
        )

        val kdfInput = fixtures.argon2AppPasswordUtf8.toByteArray(StandardCharsets.UTF_8)
        val salt = hexToBytes(fixtures.argon2AppSaltHex)
        val app = deriveArgon2id(
            kdfInput,
            salt,
            fixtures.argon2AppMemoryKiB,
            fixtures.argon2AppPasses,
            fixtures.argon2AppParallelism,
            32,
        )
        check(
            "Argon2id application-bounds expected bytes (Node↔JVM)",
            bytesToHex(app) == fixtures.argon2AppExpectedHex,
            "got=${bytesToHex(app)}",
        )
        check("Argon2id length 32", app.size == 32)

        val times = benchmarkArgon2idMs(
            kdfInput,
            salt,
            fixtures.argon2AppMemoryKiB,
            fixtures.argon2AppPasses,
            fixtures.argon2AppParallelism,
            samples = 3,
        )
        println(
            "[META] Argon2id app-min-profile latency ms min=${times.minOrNull()} avg=${times.average()} max=${times.maxOrNull()}"
        )
        println("[META] Argon2id note: desktop/JVM latency does not establish Android device performance or GPU/ASIC resistance")
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
