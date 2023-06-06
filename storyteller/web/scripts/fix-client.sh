#!/usr/bin/env bash

find ./apiClient -type f -exec sed -i'' -r "s/(} from '.*)';/\1.ts';/g" {} \;
