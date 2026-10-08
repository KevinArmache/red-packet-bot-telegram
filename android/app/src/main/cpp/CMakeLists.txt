cmake_minimum_required(VERSION 3.22.1)
project(nodebridge CXX)

# Node.js mobile (téléchargé par android/scripts/build-apk.mjs)
set(LIBNODE_DIR ${CMAKE_SOURCE_DIR}/../../../libnode)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION ${LIBNODE_DIR}/bin/${ANDROID_ABI}/libnode.so)

add_library(nodebridge SHARED node-bridge.cpp)
target_include_directories(nodebridge PRIVATE ${LIBNODE_DIR}/include/node)
target_compile_features(nodebridge PRIVATE cxx_std_17)
target_link_options(nodebridge PRIVATE "-Wl,-z,max-page-size=16384")

find_library(log-lib log)
target_link_libraries(nodebridge libnode ${log-lib})
