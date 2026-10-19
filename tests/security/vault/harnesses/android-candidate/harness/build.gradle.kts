plugins {
    application
    kotlin("jvm")
}

group = "app.daynori.vault.candidate"
version = "0.1.0-phase44"

dependencies {
    // Pinned candidate Argon2id implementation (desktop JVM host). Not a production approval.
    // Not used on Android ABIs — see android-app Bouncy Castle candidate.
    implementation("de.mkammerer:argon2-jvm:2.11")
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
}

application {
    mainClass.set("app.daynori.vault.candidate.HarnessMainKt")
}

kotlin {
    jvmToolchain(17)
    sourceSets {
        val main by getting {
            kotlin.srcDir("../shared/src/main/kotlin")
        }
    }
}

tasks.register<JavaExec>("runHarness") {
    group = "verification"
    description = "Run isolated vault candidate harness (AES-GCM + Argon2id)"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("app.daynori.vault.candidate.HarnessMainKt")
    // Required shared fixtures — missing file fails the harness.
    args = listOf(rootProject.projectDir.resolve("../shared-fixtures.json").absolutePath)
}
