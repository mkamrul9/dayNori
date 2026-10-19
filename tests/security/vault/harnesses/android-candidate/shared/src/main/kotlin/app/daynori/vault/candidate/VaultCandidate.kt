package app.daynori.vault.candidate

import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class VaultContext(
    val workspaceId: String,
    val itemId: String,
    val itemType: String,
    val schemaVersion: Int,
    val keyVersion: Int,
)

data class VaultEnvelope(
    val version: Int,
    val algorithm: String,
    val keyVersion: Int,
    val nonceB64: String,
    val ciphertextB64: String,
    val tagB64: String,
    val aad: String,
)

object EnvelopeProfile {
    const val VERSION = 1
    const val ALGORITHM = "AES-256-GCM"
    const val KEY_BYTES = 32
    const val NONCE_BYTES = 12
    const val TAG_BYTES = 16
}

fun canonicalAad(ctx: VaultContext): String =
    """{"keyVersion":${ctx.keyVersion},"schemaVersion":${ctx.schemaVersion},"itemType":"${ctx.itemType}","itemId":"${ctx.itemId}","workspaceId":"${ctx.workspaceId}"}"""

fun assertAes256Key(key: ByteArray) {
    require(key.size == EnvelopeProfile.KEY_BYTES) {
        "AES-256-GCM requires exactly ${EnvelopeProfile.KEY_BYTES}-byte keys; received ${key.size}."
    }
}

fun assertNonce(nonce: ByteArray) {
    require(nonce.size == EnvelopeProfile.NONCE_BYTES) {
        "AES-256-GCM profile requires exactly ${EnvelopeProfile.NONCE_BYTES}-byte nonces; received ${nonce.size}."
    }
}

fun encryptAesGcmRaw(
    plaintext: ByteArray,
    key: ByteArray,
    nonce: ByteArray,
    aadBytes: ByteArray,
): Pair<ByteArray, ByteArray> {
    assertAes256Key(key)
    assertNonce(nonce)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(
        Cipher.ENCRYPT_MODE,
        SecretKeySpec(key, "AES"),
        GCMParameterSpec(EnvelopeProfile.TAG_BYTES * 8, nonce),
    )
    if (aadBytes.isNotEmpty()) {
        cipher.updateAAD(aadBytes)
    }
    val out = cipher.doFinal(plaintext)
    val ct = out.copyOfRange(0, out.size - EnvelopeProfile.TAG_BYTES)
    val tag = out.copyOfRange(out.size - EnvelopeProfile.TAG_BYTES, out.size)
    return ct to tag
}

fun encryptAesGcm(
    plaintext: ByteArray,
    key: ByteArray,
    ctx: VaultContext,
    nonce: ByteArray = ByteArray(EnvelopeProfile.NONCE_BYTES).also { SecureRandom().nextBytes(it) },
): VaultEnvelope {
    val aad = canonicalAad(ctx)
    val (ct, tag) = encryptAesGcmRaw(
        plaintext,
        key,
        nonce,
        aad.toByteArray(StandardCharsets.UTF_8),
    )
    return VaultEnvelope(
        version = EnvelopeProfile.VERSION,
        algorithm = EnvelopeProfile.ALGORITHM,
        keyVersion = ctx.keyVersion,
        nonceB64 = Base64.getEncoder().encodeToString(nonce),
        ciphertextB64 = if (ct.isEmpty()) "" else Base64.getEncoder().encodeToString(ct),
        tagB64 = Base64.getEncoder().encodeToString(tag),
        aad = aad,
    )
}

fun decryptAesGcm(envelope: VaultEnvelope, key: ByteArray, expected: VaultContext): ByteArray {
    assertAes256Key(key)
    require(envelope.version == EnvelopeProfile.VERSION) { "Unsupported envelope version" }
    require(envelope.algorithm == EnvelopeProfile.ALGORITHM) { "Unsupported algorithm" }
    require(envelope.keyVersion == expected.keyVersion) { "keyVersion inconsistent with AAD context" }
    val expectedAad = canonicalAad(expected)
    require(envelope.aad == expectedAad) { "AAD mismatch" }

    val nonce = Base64.getDecoder().decode(envelope.nonceB64)
    val ct = if (envelope.ciphertextB64.isEmpty()) ByteArray(0) else Base64.getDecoder().decode(envelope.ciphertextB64)
    val tag = Base64.getDecoder().decode(envelope.tagB64)
    assertNonce(nonce)
    require(tag.size == EnvelopeProfile.TAG_BYTES) { "Invalid tag length" }

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(
        Cipher.DECRYPT_MODE,
        SecretKeySpec(key, "AES"),
        GCMParameterSpec(EnvelopeProfile.TAG_BYTES * 8, nonce),
    )
    cipher.updateAAD(envelope.aad.toByteArray(StandardCharsets.UTF_8))
    val combined = ct + tag
    return cipher.doFinal(combined)
}

fun hexToBytes(hex: String): ByteArray {
    if (hex.isEmpty()) return ByteArray(0)
    require(hex.length % 2 == 0)
    return ByteArray(hex.length / 2) { i ->
        hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
}

fun bytesToHex(bytes: ByteArray): String =
    bytes.joinToString("") { b -> "%02x".format(b) }

/** Build an envelope from independently established ciphertext/tag bytes (cross-impl exchange). */
fun envelopeFromParts(
    ctx: VaultContext,
    nonce: ByteArray,
    ciphertext: ByteArray,
    tag: ByteArray,
): VaultEnvelope {
    assertNonce(nonce)
    require(tag.size == EnvelopeProfile.TAG_BYTES)
    return VaultEnvelope(
        version = EnvelopeProfile.VERSION,
        algorithm = EnvelopeProfile.ALGORITHM,
        keyVersion = ctx.keyVersion,
        nonceB64 = Base64.getEncoder().encodeToString(nonce),
        ciphertextB64 = if (ciphertext.isEmpty()) "" else Base64.getEncoder().encodeToString(ciphertext),
        tagB64 = Base64.getEncoder().encodeToString(tag),
        aad = canonicalAad(ctx),
    )
}
