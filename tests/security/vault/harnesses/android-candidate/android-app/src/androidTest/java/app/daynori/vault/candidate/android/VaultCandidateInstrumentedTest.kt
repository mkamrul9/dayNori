package app.daynori.vault.candidate.android

import android.util.Base64
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.daynori.vault.candidate.VaultContext
import app.daynori.vault.candidate.bytesToHex
import app.daynori.vault.candidate.canonicalAad
import app.daynori.vault.candidate.decryptAesGcm
import app.daynori.vault.candidate.encryptAesGcm
import app.daynori.vault.candidate.encryptAesGcmRaw
import app.daynori.vault.candidate.envelopeFromParts
import app.daynori.vault.candidate.hexToBytes
import app.daynori.vault.candidate.loadSharedFixturesJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.charset.StandardCharsets

/**
 * Emulator/device instrumentation evidence for the Android candidate.
 * Emulator PASS ≠ physical-device / hardware-backed unlock evidence.
 */
@RunWith(AndroidJUnit4::class)
class VaultCandidateInstrumentedTest {

    private lateinit var fixturesJson: String

    @Before
    fun loadFixtures() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        fixturesJson = ctx.assets.open("shared-fixtures.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    @Test
    fun androidCandidateHarness_crossImplAndArgon2() {
        val log = StringBuilder()
        fun pass(name: String) {
            log.appendLine("[PASS] $name")
            Log.i(TAG, "[PASS] $name")
        }
        fun check(name: String, condition: Boolean, detail: String = "") {
            if (condition) pass(name) else {
                log.appendLine("[FAIL] $name ${if (detail.isNotEmpty()) "— $detail" else ""}")
                Log.e(TAG, "[FAIL] $name $detail")
                fail("$name $detail")
            }
        }

        val fixtures = loadSharedFixturesJson(fixturesJson)
        val device = android.os.Build.MODEL
        val api = android.os.Build.VERSION.SDK_INT
        Log.i(TAG, "device=$device api=$api kdf=${Argon2BouncyCastle.LIBRARY}")
        log.appendLine("[META] device=$device api=$api")
        log.appendLine("[META] kdf=${Argon2BouncyCastle.LIBRARY} (pure Java; Android ABI portable)")
        log.appendLine("[META] note=emulator result is not physical-device or Keystore evidence")

        val ctx = fixtures.sampleContext
        check("canonical AAD", canonicalAad(ctx) == fixtures.canonicalAad)
        check(
            "canonical AAD UTF-8",
            bytesToHex(canonicalAad(ctx).toByteArray(StandardCharsets.UTF_8)) == fixtures.canonicalAadUtf8Hex,
        )

        val (_, tag13) = encryptAesGcmRaw(
            hexToBytes(fixtures.case13.ptHex),
            hexToBytes(fixtures.case13.keyHex),
            hexToBytes(fixtures.case13.ivHex),
            hexToBytes(fixtures.case13.aadHex),
        )
        check("McGrew Case 13 tag", bytesToHex(tag13) == fixtures.case13.tagHex)

        val (ct14, tag14) = encryptAesGcmRaw(
            hexToBytes(fixtures.case14.ptHex),
            hexToBytes(fixtures.case14.keyHex),
            hexToBytes(fixtures.case14.ivHex),
            hexToBytes(fixtures.case14.aadHex),
        )
        check("McGrew Case 14 ct", bytesToHex(ct14) == fixtures.case14.ctHex)
        check("McGrew Case 14 tag", bytesToHex(tag14) == fixtures.case14.tagHex)

        fun cross(label: String, pt: ByteArray, ctHex: String, tagHex: String) {
            val key = hexToBytes(fixtures.crossKeyHex)
            val nonce = hexToBytes(fixtures.crossNonceHex)
            val foreign = envelopeFromParts(ctx, nonce, hexToBytes(ctHex), hexToBytes(tagHex))
            check("$label Node→Android decrypt", decryptAesGcm(foreign, key, ctx).contentEquals(pt))
            val produced = encryptAesGcm(pt, key, ctx, nonce)
            val producedCt =
                if (produced.ciphertextB64.isEmpty()) ByteArray(0)
                else Base64.decode(produced.ciphertextB64, Base64.DEFAULT)
            check("$label Android→expected encrypt", producedCt.contentEquals(hexToBytes(ctHex)))
            check(
                "$label Android→expected tag",
                bytesToHex(Base64.decode(produced.tagB64, Base64.DEFAULT)) == tagHex,
            )
        }

        cross("Empty", ByteArray(0), fixtures.crossEmpty.ctHex, fixtures.crossEmpty.tagHex)
        cross(
            "Unicode",
            fixtures.crossUnicode.ptUtf8!!.toByteArray(StandardCharsets.UTF_8),
            fixtures.crossUnicode.ctHex,
            fixtures.crossUnicode.tagHex,
        )
        cross(
            "Binary",
            hexToBytes(fixtures.crossBinary.ptHex!!),
            fixtures.crossBinary.ctHex,
            fixtures.crossBinary.tagHex,
        )

        run {
            val key = hexToBytes(fixtures.crossKeyHex)
            val env = envelopeFromParts(
                ctx,
                hexToBytes(fixtures.crossNonceHex),
                hexToBytes(fixtures.crossBinary.ctHex),
                hexToBytes(fixtures.crossBinary.tagHex),
            )
            val wrong = key.copyOf().also { it[0] = (it[0].toInt() xor 1).toByte() }
            try {
                decryptAesGcm(env, wrong, ctx)
                fail("Wrong key should reject")
            } catch (_: Exception) {
                pass("Wrong key rejected")
            }
            try {
                decryptAesGcm(env, key, ctx.copy(itemId = "33333333-3333-4333-8333-333333333333"))
                fail("Wrong context should reject")
            } catch (_: Exception) {
                pass("Wrong context rejected")
            }
            val tampered = hexToBytes(fixtures.crossBinary.ctHex).copyOf()
            tampered[0] = (tampered[0].toInt() xor 1).toByte()
            try {
                decryptAesGcm(
                    envelopeFromParts(ctx, hexToBytes(fixtures.crossNonceHex), tampered, hexToBytes(fixtures.crossBinary.tagHex)),
                    key,
                    ctx,
                )
                fail("Tamper should reject")
            } catch (_: Exception) {
                pass("Tamper rejected")
            }
        }

        val ref = Argon2BouncyCastle.deriveArgon2idReferenceVector(
            hexToBytes(fixtures.argon2PasswordHex),
            hexToBytes(fixtures.argon2SaltHex),
            fixtures.argon2MemoryKiB,
            fixtures.argon2Passes,
            fixtures.argon2Parallelism,
            32,
        )
        check("Argon2id password+salt expected", bytesToHex(ref) == fixtures.argon2ExpectedHex, bytesToHex(ref))

        val app = Argon2BouncyCastle.deriveArgon2id(
            fixtures.argon2AppPasswordUtf8.toByteArray(StandardCharsets.UTF_8),
            hexToBytes(fixtures.argon2AppSaltHex),
            fixtures.argon2AppMemoryKiB,
            fixtures.argon2AppPasses,
            fixtures.argon2AppParallelism,
            32,
        )
        check("Argon2id app-bounds Node↔Android", bytesToHex(app) == fixtures.argon2AppExpectedHex, bytesToHex(app))
        assertEquals(32, app.size)

        log.appendLine("HARNESS RESULT: PASS")
        Log.i(TAG, log.toString())
        assertTrue(log.toString().contains("HARNESS RESULT: PASS"))
    }

    /**
     * Small isolated Keystore smoke for Phase 44 evidence only — not Phase 46 unlock UI.
     */
    @Test
    fun androidKeystoreAesKey_generateAndEncryptSmoke() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) {
            Log.i(TAG, "[META] Keystore smoke skipped: API < 23")
            return
        }
        val alias = "daynori_vault_candidate_smoke"
        val keyGen = javax.crypto.KeyGenerator.getInstance(
            android.security.keystore.KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore",
        )
        val spec = android.security.keystore.KeyGenParameterSpec.Builder(
            alias,
            android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or
                android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGen.init(spec)
        val secret = keyGen.generateKey()
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, secret)
        val ct = cipher.doFinal("candidate-smoke".toByteArray(StandardCharsets.UTF_8))
        assertTrue(ct.isNotEmpty())
        Log.i(TAG, "[PASS] AndroidKeyStore AES-256-GCM smoke (not biometric-bound unlock proof)")
        // Cleanup
        val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
    }

    companion object {
        private const val TAG = "DaynoriVaultCandidate"
    }
}
