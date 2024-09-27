#!/usr/bin/env bash

set -euo pipefail

## toy script wrapping the UCSC liftover tool

## bash run-liftover.sh -c 37 -t 38 "$BEDSTR"

if [ ! $# -eq 5 ]; then
    echo "not enough arguments" >&2
    exit 1
fi

while getopts "c:t:" opt; do
    case ${opt} in
    c) CURRENT=${OPTARG} ;;
    t) TARGET=${OPTARG} ;;
    esac
done

if [[ -z $CURRENT || -z $TARGET || $TARGET -eq $CURRENT ]]; then
    echo "misnamed or identicial arguments" >&2 && exit 1
fi

if [[ $CURRENT -ne 37 && $CURRENT -ne 38 && $TARGET -ne 37 && $TARGET -ne 38 ]]; then
    echo "arguments must be 37 or 38" >&2 && exit 1
fi

INPUT_FILE=$(mktemp)
OUTPUT_FILE=$(mktemp)
OUTPUT_UNLIFTED=$(mktemp)

# should be in format `chr<chr>\t<pos>\t<pos>\n`
echo "${5}" >$INPUT_FILE

if [[ $CURRENT -eq 37 ]]; then
    CHAIN=/home/node/chains/hg19ToHg38.over.chain
else
    CHAIN=/home/node/chains/hg38ToHg19.over.chain
fi

liftOver ${INPUT_FILE} ${CHAIN} ${OUTPUT_FILE} ${OUTPUT_UNLIFTED} 2>/dev/null

LIFTED=$(cat ${OUTPUT_FILE} | awk '{print $2}')

# there will be a `#Deleted in...` line for every unlifted pos
UNLIFTED=$(cat ${OUTPUT_UNLIFTED} | awk '/#.\+/d {print $2}')

echo "${LIFTED}|${UNLIFTED}"

rm ${INPUT_FILE} ${OUTPUT_FILE} ${OUTPUT_UNLIFTED}
