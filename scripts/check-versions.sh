#!/usr/bin/env bash

VERSION_CHECK=$(yarn version check)

if git diff origin/main -- web/package.json | grep -q -e '^+ *"version":' || echo $VERSION_CHECK | grep -q -v -e '@storyteller/web'
then
  echo "@storyteller/web doesn't need a version bump"
else
  echo $VERSION_CHECK | sed -r 's/➤/\n➤/g'
  exit 1
fi

if git diff origin/main -- mobile/package.json | grep -q -e '^+ *"version":' || echo $VERSION_CHECK | grep -q -v -e '@storyteller/mobile'
then
  echo "@storyteller/mobile doesn't need a version bump"
else
  echo $VERSION_CHECK | sed -r 's/➤/\n➤/g'
  exit 1
fi

if git diff origin/main -- docs/package.json | grep -q -e '^+ *"version":' || echo $VERSION_CHECK | grep -q -v -e '@storyteller/docs'
then
  echo "@storyteller/docs doesn't need a version bump"
else
  echo $VERSION_CHECK | sed -r 's/➤/\n➤/g'
  exit 1
fi
