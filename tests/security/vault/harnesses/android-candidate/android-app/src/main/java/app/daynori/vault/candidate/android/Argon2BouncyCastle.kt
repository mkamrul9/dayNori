package app.daynori.vault.candidate.android

import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters
import org.bouncycastle.jce.provider.BouncyCastleProvider
import java.security.Security

/**
 * Android-candidate Argon2id via Bouncy Castle (pure Java).
 * Verified approach for Android ABIs without argon2-jvm native/JNA gaps.
 * Candidate evaluation ≠ production approval.
 */
object Argon2BouncyCastle {
    const val PROVIDER_NAME = "BC"
    const val LIBRARY = "org.bouncycastle:bcprov-jdk18on:1.78.1"

    init {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
    }

    fun deriveArgon2id(
        password: ByteArray,
        salt: ByteArray,
        memoryKiB: Int,
        passes: Int,
        parallelism: Int,
        hashLength: Int,
    ): ByteArray {
        require(memoryKiB in 16_384..262_144)
        require(passes in 2..10)
        require(parallelism in 1..4)
        require(hashLength == 32)
        require(salt.size in 16..64)
        return raw(password, salt, memoryKiB, passes, parallelism, hashLength)
    }

    fun deriveArgon2idReferenceVector(
        password: ByteArray,
        salt: ByteArray,
        memoryKiB: Int,
        passes: Int,
        parallelism: Int,
        hashLength: Int,
    ): ByteArray {
        require(memoryKiB in 8..262_144)
        require(passes in 1..10)
        require(parallelism in 1..4)
        require(hashLength == 32)
        require(salt.size in 8..64)
        return raw(password, salt, memoryKiB, passes, parallelism, hashLength)
    }

    private fun raw(
        password: ByteArray,
        salt: ByteArray,
        memoryKiB: Int,
        passes: Int,
        parallelism: Int,
        hashLength: Int,
    ): ByteArray {
        val params = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withSalt(salt)
            .withMemoryAsKB(memoryKiB)
            .withIterations(passes)
            .withParallelism(parallelism)
            .build()
        val gen = Argon2BytesGenerator()
        gen.init(params)
        val out = ByteArray(hashLength)
        gen.generateBytes(password, out)
        return out
    }
}
