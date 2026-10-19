plugins {
    application
    kotlin("jvm") version "1.9.25"
}

group = "app.daynori.vault.candidate"
version = "0.1.0-phase44"

repositories {
    mavenCentral()
}

dependencies {
    // Pinned candidate Argon2id implementation (JVM). Not a production approval.
    implementation("de.mkammerer:argon2-jvm:2.11")
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
}

application {
    mainClass.set("app.daynori.vault.candidate.HarnessMainKt")
}

kotlin {
    jvmToolchain(17)
}

tasks.register<JavaExec>("runHarness") {
    group = "verification"
    description = "Run isolated vault candidate harness (AES-GCM + Argon2id)"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("app.daynori.vault.candidate.HarnessMainKt")
    // Point at shared fixtures from harnesses/
    args = listOf(rootProject.projectDir.resolve("../shared-fixtures.json").absolutePath)
}
