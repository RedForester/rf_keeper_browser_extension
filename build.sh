#!/bin/sh

mkdir -p dist
zip -r dist/extension.zip ./manifest.json ./icons ./src
