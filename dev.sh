#!/bin/bash

DEBUG=${DEBUG:-"app:*"} deno run --watch --env-file=.env -INERSW --allow-ffi --unstable-ffi src/index.ts
