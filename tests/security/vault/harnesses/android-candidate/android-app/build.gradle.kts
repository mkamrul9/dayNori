plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.daynori.vault.candidate.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.daynori.vault.candidate.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-phase44"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        getByName("main") {
            java.srcDir("../shared/src/main/kotlin")
            assets.srcDirs("src/main/assets")
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Pure-Java Argon2id candidate for Android ABIs/API levels (not argon2-jvm native/JNA).
    // Pinned; candidate evaluation ≠ production approval.
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
}

tasks.register<Copy>("syncSharedFixtures") {
    from(rootProject.projectDir.resolve("../shared-fixtures.json"))
    into(layout.projectDirectory.dir("src/main/assets"))
    rename { "shared-fixtures.json" }
}

tasks.named("preBuild").configure {
    dependsOn("syncSharedFixtures")
}
