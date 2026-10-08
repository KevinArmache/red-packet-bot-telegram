// node-bridge.cpp — Démarre Node.js mobile depuis Kotlin (NodeRuntime.startNode).
//
// node::Start() bloque jusqu'à la fin de Node : Kotlin l'appelle depuis un
// thread dédié. La sortie standard de Node est aussi recopiée dans logcat
// (tag « RedPacketBot-node ») pour le débogage avec adb.

#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "node.h"

namespace {

const char *kLogTag = "RedPacketBot-node";
int pipeStdout[2];
int pipeStderr[2];

void *pumpToLogcat(void *arg) {
    const int fd = *static_cast<int *>(arg);
    const int priority = (fd == pipeStderr[0]) ? ANDROID_LOG_WARN : ANDROID_LOG_INFO;
    char buffer[2048];
    ssize_t size;
    while ((size = read(fd, buffer, sizeof buffer - 1)) > 0) {
        if (buffer[size - 1] == '\n') --size;
        buffer[size] = '\0';
        __android_log_write(priority, kLogTag, buffer);
    }
    return nullptr;
}

void redirectStdStreams() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipeStdout) == 0 && pipe(pipeStderr) == 0) {
        dup2(pipeStdout[1], STDOUT_FILENO);
        dup2(pipeStderr[1], STDERR_FILENO);
        pthread_t out, err;
        if (pthread_create(&out, nullptr, pumpToLogcat, &pipeStdout[0]) == 0) pthread_detach(out);
        if (pthread_create(&err, nullptr, pumpToLogcat, &pipeStderr[0]) == 0) pthread_detach(err);
    }
}

}  // namespace

extern "C" JNIEXPORT jint JNICALL
Java_com_redpacketbot_app_NodeRuntime_startNode(JNIEnv *env, jobject /* this */, jobjectArray arguments) {
    // node::Start veut des arguments contigus en mémoire
    const jsize count = env->GetArrayLength(arguments);
    std::vector<std::string> values;
    size_t total = 0;
    for (jsize i = 0; i < count; i++) {
        auto jvalue = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char *chars = env->GetStringUTFChars(jvalue, nullptr);
        values.emplace_back(chars);
        env->ReleaseStringUTFChars(jvalue, chars);
        env->DeleteLocalRef(jvalue);
        total += values.back().size() + 1;
    }

    char *buffer = static_cast<char *>(calloc(total, sizeof(char)));
    std::vector<char *> argv(count);
    char *position = buffer;
    for (jsize i = 0; i < count; i++) {
        memcpy(position, values[i].c_str(), values[i].size());
        argv[i] = position;
        position += values[i].size() + 1;
    }

    redirectStdStreams();
    return static_cast<jint>(node::Start(count, argv.data()));
}
