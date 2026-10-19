package app.daynori.vault.candidate

import de.mkammerer.argon2.Argon2Factory
import kotlin.system.measureNanoTime

/**
 * Candidate Argon2id using argon2-jvm (pinned) for desktop JVM host evidence.
 * Not approved for Android ABIs — use the Android Bouncy Castle candidate there.
 */
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
    return rawArgon2id(password, salt, memoryKiB, passes, parallelism, hashLength)
}

/**
 * Reference/regression Argon2id path allowing RFC-scale memory for published vectors only.
 * Must not be used as application unlock policy.
 */
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
    return rawArgon2id(password, salt, memoryKiB, passes, parallelism, hashLength)
}

private fun rawArgon2id(
    password: ByteArray,
    salt: ByteArray,
    memoryKiB: Int,
    passes: Int,
    parallelism: Int,
    hashLength: Int,
): ByteArray {
    val argon2 = Argon2Factory.createAdvanced(
        Argon2Factory.Argon2Types.ARGON2id,
        salt.size,
        hashLength,
    )
    return argon2.rawHash(passes, memoryKiB, parallelism, password, salt)
}

fun benchmarkArgon2idMs(
    password: ByteArray,
    salt: ByteArray,
    memoryKiB: Int,
    passes: Int,
    parallelism: Int,
    samples: Int,
): List<Double> {
    val times = mutableListOf<Double>()
    repeat(samples) {
        val ns = measureNanoTime {
            deriveArgon2id(password, salt, memoryKiB, passes, parallelism, 32)
        }
        times += ns / 1_000_000.0
    }
    return times
}
