#!/usr/bin/env bash

VERSION_CHECK=$(yarn version check)

if git diff origin/main -- ./package.json | grep -q -e '^+ *"version":' || echo $VERSION_CHECK | grep -q -v -e '@storyteller/web'
then
  exit 0
else
  echo $VERSION_CHECK | sed -r 's/➤/\n➤/g'
  exit 1
fi

if git diff origin/main -- ./package.json | grep -q -e '^+ *"version":' || echo $VERSION_CHECK | grep -q -v -e '@storyteller/docs'
then
  exit 0
else
  echo $VERSION_CHECK | sed -r 's/➤/\n➤/g'
  exit 1
fi
