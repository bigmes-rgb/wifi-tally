#!/bin/bash -eux

RELEASE_DIR="./dist"
REACT_DIR="./build"
BUILD_NAME=${BUILD_NAME:=$(git describe --tags --always)}
BUILD_NAME=${BUILD_NAME/#v/} # remove the leading "v" in the version

if [ -z "${CI:=""}" ]; then
  # not on CI
  PACKAGE_PRIVATE="true"
else
  PACKAGE_PRIVATE="false"
fi

# npm metadata. Upstream asked the GitHub API for these; the fork keeps them static
# so that packaging works the same with or without a token.
REPO_SLUG="${GITHUB_REPOSITORY:-bigmes-rgb/wifi-tally}"
PACKAGE_LICENSE="MIT"
PACKAGE_DESCRIPTION="An affordable and reliable Tally Light that works via WiFi based on NodeMCU / ESP8266."
PACKAGE_TOPICS='["esp8266","nodemcu","roland","atem","obs-studio","tally","vmix","tally-light"]'
PACKAGE_HOMEPAGE="https://github.com/${REPO_SLUG}"
PACKAGE_ISSUES="https://github.com/${REPO_SLUG}/issues"
PACKAGE_REPO="github:${REPO_SLUG}"

# ###
#
# PREPARE
#
# ###

rm -rf "$RELEASE_DIR" "$REACT_DIR"
mkdir "$RELEASE_DIR"

# ###
#
# BUILD BACKEND / SERVER
#
# ###

mkdir "$RELEASE_DIR/src"
npm run build:backend -- --outDir "$RELEASE_DIR/src"

# ###
# 
# BUILD FRONTEND / CLIENT
# 
# ###


# "CI=false": We don't want to have the build fail on warnings
# @see https://github.com/facebook/create-react-app/issues/3657#issuecomment-354797029
CI=false npm run build:frontend
# react-scripts has the "build" directory hard-coded. So we need to move it
cp -r "$REACT_DIR" "$RELEASE_DIR/src/frontend"

# ###
#
# copy files
#
# ###

mkdir "$RELEASE_DIR/bin"
cp "./scripts/bin-vtally" "$RELEASE_DIR/bin/vtally"

# ###
# 
# write package.json
#
# ###

NPM_START="./bin/vtally"
# copy a cleaned up package.json
JQ_FILTER="{name: .name, version: \"${BUILD_NAME}\", description: \"${PACKAGE_DESCRIPTION}\", keywords: ${PACKAGE_TOPICS}, homepage: \"${PACKAGE_HOMEPAGE}\", bugs: \"${PACKAGE_ISSUES}\", license: \"${PACKAGE_LICENSE}\", private: ${PACKAGE_PRIVATE}, repository: \"${PACKAGE_REPO}\", engines: .engines, bin: {vtally: \"${NPM_START}\"}, dependencies: .dependencies, os: .os, cpu: .cpu}"
jq "$JQ_FILTER" package.json > "$RELEASE_DIR/package.json"
cp package-lock.json "$RELEASE_DIR/package-lock.json"

cd "$RELEASE_DIR"
# remove devDependencies from lock file
npm install --package-lock-only

